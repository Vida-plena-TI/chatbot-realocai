import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import serializers
from rest_framework.test import APIClient

from core.exceptions import CSRF_FAILED, NOT_AUTHENTICATED, _first_message

EMAIL = "profissional@exemplo.com"
PASSWORD = "senha-forte-123"


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(email=EMAIL, password=PASSWORD)


@pytest.mark.django_db
def test_anonymous_gets_401_with_portuguese_detail():
    response = APIClient().get(reverse("auth:me"))

    assert response.status_code == 401
    assert response.json() == {"detail": NOT_AUTHENTICATED}


def test_drf_csrf_failure_is_json_in_portuguese(user):
    client = APIClient(enforce_csrf_checks=True)
    client.login(email=EMAIL, password=PASSWORD)

    response = client.post(reverse("auth:logout"))

    assert response.status_code == 403
    assert response.json() == {"detail": CSRF_FAILED}


def test_django_csrf_failure_on_login_is_json_in_portuguese(user):
    client = APIClient(enforce_csrf_checks=True)

    response = client.post(
        reverse("auth:login"), {"email": EMAIL, "password": PASSWORD}, format="json"
    )

    assert response.status_code == 403
    assert response["Content-Type"] == "application/json"
    assert response.json() == {"detail": CSRF_FAILED}


def test_malformed_json_is_400_with_detail(user):
    client = APIClient()
    client.force_login(user)

    response = client.post(
        reverse("chat:conversation-list"), "{nope", content_type="application/json"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Requisição malformada."}


def test_method_not_allowed_has_detail(user):
    client = APIClient()
    client.force_login(user)

    response = client.put(reverse("auth:me"))

    assert response.status_code == 405
    assert set(response.json()) == {"detail"}


@pytest.mark.parametrize(
    "data, expected",
    [
        ({"detail": "Algo deu errado."}, "Algo deu errado."),
        ({"content": ["Primeiro.", "Segundo."], "title": ["Outro."]}, "Primeiro."),
        (["Só um."], "Só um."),
        ({"blocos": [{}, {"tipo": ["Interno."]}]}, "Interno."),
        ({"non_field_errors": [serializers.ErrorDetail("Detalhe.")]}, "Detalhe."),
        ({}, None),
    ],
)
def test_first_message_flattens_any_error_shape(data, expected):
    assert _first_message(data) == expected
