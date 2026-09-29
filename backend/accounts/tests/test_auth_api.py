import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()

EMAIL = "equipe@exemplo.com"
PASSWORD = "senha-forte-123"
GENERIC_ERROR = {"detail": "Credenciais inválidas."}

pytestmark = pytest.mark.django_db


@pytest.fixture
def user():
    return User.objects.create_user(email=EMAIL, password=PASSWORD, full_name="Maria Teste")


@pytest.fixture
def client():
    return APIClient()


def login(client, email=EMAIL, password=PASSWORD):
    return client.post(reverse("auth:login"), {"email": email, "password": password}, format="json")


def csrf_client():
    """Client that enforces CSRF like a browser and holds a fresh csrftoken cookie."""
    client = APIClient(enforce_csrf_checks=True)
    client.get(reverse("auth:csrf"))
    return client


def csrf_token(client):
    return client.cookies[settings.CSRF_COOKIE_NAME].value


def test_csrf_endpoint_sets_cookie(client):
    response = client.get(reverse("auth:csrf"))

    assert response.status_code == 200
    assert response.json() == {"detail": "csrf cookie set"}
    cookie = response.cookies[settings.CSRF_COOKIE_NAME]
    assert cookie.value
    assert not cookie["httponly"]
    assert cookie["samesite"] == "Lax"


def test_login_with_valid_credentials_returns_user(client, user):
    response = login(client)

    assert response.status_code == 200
    assert response.json() == {
        "id": user.id,
        "email": EMAIL,
        "full_name": "Maria Teste",
        "is_staff": False,
    }
    assert "password" not in response.content.decode()
    session_cookie = response.cookies[settings.SESSION_COOKIE_NAME]
    assert session_cookie["httponly"]
    assert session_cookie["samesite"] == "Lax"


@pytest.mark.parametrize(
    "email, password",
    [
        (EMAIL, "senha-errada-123"),
        ("ninguem@exemplo.com", PASSWORD),
        ("nao-e-email", PASSWORD),
        (EMAIL, ""),
    ],
    ids=["wrong-password", "unknown-email", "malformed-email", "empty-password"],
)
def test_login_failure_is_generic(client, user, email, password):
    response = login(client, email, password)

    assert response.status_code == 401
    assert response.json() == GENERIC_ERROR


def test_login_with_missing_fields_is_generic(client, user):
    response = client.post(reverse("auth:login"), {}, format="json")

    assert response.status_code == 401
    assert response.json() == GENERIC_ERROR


def test_login_with_inactive_user_fails(client, user):
    user.is_active = False
    user.save()

    response = login(client)

    assert response.status_code == 401
    assert response.json() == GENERIC_ERROR
    assert client.get(reverse("auth:me")).status_code == 401


def test_me_requires_session(client, user):
    assert client.get(reverse("auth:me")).status_code == 401

    login(client)
    response = client.get(reverse("auth:me"))

    assert response.status_code == 200
    assert response.json()["email"] == EMAIL


def test_logout_ends_session(client, user):
    login(client)

    response = client.post(reverse("auth:logout"))

    assert response.status_code == 204
    assert client.get(reverse("auth:me")).status_code == 401


def test_logout_requires_authentication(client):
    assert client.post(reverse("auth:logout")).status_code == 401


def test_authenticated_post_without_csrf_token_is_rejected(user):
    client = APIClient(enforce_csrf_checks=True)
    client.login(email=EMAIL, password=PASSWORD)

    response = client.post(reverse("auth:logout"))

    assert response.status_code == 403
    assert client.get(reverse("auth:me")).status_code == 200  # session untouched


def test_login_without_csrf_token_is_rejected(user):
    client = APIClient(enforce_csrf_checks=True)

    response = login(client)

    assert response.status_code == 403
    assert client.get(reverse("auth:me")).status_code == 401


def test_full_spa_flow_with_csrf(user):
    client = csrf_client()

    response = client.post(
        reverse("auth:login"),
        {"email": EMAIL, "password": PASSWORD},
        format="json",
        HTTP_X_CSRFTOKEN=csrf_token(client),
    )
    assert response.status_code == 200

    # login() rotates the token; the SPA must use the new cookie value.
    response = client.post(reverse("auth:logout"), HTTP_X_CSRFTOKEN=csrf_token(client))
    assert response.status_code == 204
    assert client.get(reverse("auth:me")).status_code == 401


def test_login_is_throttled_after_five_attempts(client, user):
    for _ in range(5):
        assert login(client, password="senha-errada-123").status_code == 401

    response = login(client)  # even correct credentials are blocked now

    assert response.status_code == 429
    assert client.get(reverse("auth:me")).status_code == 401
