import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()

DOC_URLS = ["schema", "docs"]

pytestmark = pytest.mark.django_db


@override_settings(DEBUG=False)
@pytest.mark.parametrize("url_name", DOC_URLS)
def test_docs_require_authentication_outside_debug(url_name):
    response = APIClient().get(reverse(url_name))

    assert response.status_code in (401, 403)


@override_settings(DEBUG=False)
@pytest.mark.parametrize("url_name", DOC_URLS)
def test_docs_are_forbidden_for_non_staff_outside_debug(url_name):
    client = APIClient()
    client.force_login(User.objects.create_user(email="p@exemplo.com", password="x"))

    assert client.get(reverse(url_name)).status_code == 403


@override_settings(DEBUG=False)
@pytest.mark.parametrize("url_name", DOC_URLS)
def test_docs_are_available_to_staff_outside_debug(url_name):
    client = APIClient()
    client.force_login(User.objects.create_user(email="s@exemplo.com", password="x", is_staff=True))

    assert client.get(reverse(url_name)).status_code == 200


@override_settings(DEBUG=True)
@pytest.mark.parametrize("url_name", DOC_URLS)
def test_docs_are_public_in_debug(url_name):
    assert APIClient().get(reverse(url_name)).status_code == 200
