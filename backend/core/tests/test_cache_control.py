"""Every API response carries `Cache-Control: no-store, private` (health check aside)."""

import httpx
import pytest
from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.test import RequestFactory
from django.urls import reverse
from rest_framework.test import APIClient

from chat.models import Conversation
from chat.tests.conftest import REALOCAI_CHAT_URL
from chat.tests.test_api import messages_url
from core.middleware import NoStoreApiMiddleware
from reports.tests.test_export_contract import load_example

pytestmark = pytest.mark.django_db

PASSWORD = "senha-forte-123"


def directives(response):
    return {d.strip() for d in response.get("Cache-Control", "").split(",") if d.strip()}


def assert_no_store(response):
    assert {"no-store", "private"} <= directives(response)


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(email="profissional@exemplo.com", password=PASSWORD)


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def conversation(user):
    return Conversation.objects.create(user=user)


def test_chat_message_and_history(api, conversation, respx_mock, settings):
    settings.REALOCAI_BASE_URL = "http://realocai.test"
    settings.REALOCAI_API_KEY = "fake-key"
    settings.REALOCAI_USE_FAKE = False
    settings.OPENAI_API_KEY = ""
    blocos = [load_example("disponibilidade_vagas")]
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200, json={"conversa_id": "ext-1", "resposta": "Resposta.", "blocos": blocos}
        )
    )

    sent = api.post(messages_url(conversation), {"content": "Pergunta"}, format="json")
    history = api.get(messages_url(conversation))
    listing = api.get(reverse("chat:conversation-list"))

    for response in (sent, history, listing):
        assert response.status_code in (200, 201)
        assert_no_store(response)


def test_login_success_and_failure(user):
    client = APIClient()
    url = reverse("auth:login")

    ok = client.post(url, {"email": user.email, "password": PASSWORD}, format="json")
    bad = client.post(url, {"email": user.email, "password": "errada"}, format="json")

    assert ok.status_code == 200
    assert bad.status_code == 401
    assert_no_store(ok)
    assert_no_store(bad)


def test_anonymous_401(db):
    response = APIClient().get(reverse("chat:conversation-list"))

    assert response.status_code == 401
    assert_no_store(response)


def test_export_keeps_its_own_no_store(api):
    response = api.post(
        reverse("reports:export"),
        {"formato": "excel", "blocos": [load_example("disponibilidade_vagas")]},
        format="json",
    )

    assert response.status_code == 200
    assert directives(response) == {"no-store", "private"}


def test_health_check_is_left_alone(client):
    response = client.get(reverse("core:health"))

    assert response.status_code == 200
    assert "no-store" not in directives(response)


def test_view_directives_are_kept_and_public_is_dropped():
    def view(request):
        response = HttpResponse()
        response["Cache-Control"] = "public, max-age=60"
        return response

    response = NoStoreApiMiddleware(view)(RequestFactory().get("/api/qualquer/"))

    assert directives(response) == {"no-store", "private", "max-age=60"}


def test_paths_outside_the_api_are_left_alone():
    response = NoStoreApiMiddleware(lambda request: HttpResponse())(
        RequestFactory().get("/static/app.css")
    )

    assert "Cache-Control" not in response
