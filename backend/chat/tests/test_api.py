import json
import logging
import uuid

import httpx
import pytest
from django.conf import settings
from django.urls import reverse
from rest_framework.test import APIClient

from chat.models import Conversation, Message
from chat.services.agent import AGENT_UNAVAILABLE_MESSAGE
from chat.services.conversations import append_message, soft_delete_conversation

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL

pytestmark = pytest.mark.django_db

QUESTION = "Quais horários a Dra. Fictícia tem livres amanhã?"
ANSWER = "A Dra. Fictícia tem horários às 9h e às 14h."
CONVERSATION_FIELDS = {"id", "title", "status", "created_at", "updated_at"}
MESSAGE_FIELDS = {"id", "seq", "role", "content", "created_at"}


def list_url():
    return reverse("chat:conversation-list")


def detail_url(conversation):
    pk = conversation.pk if isinstance(conversation, Conversation) else conversation
    return reverse("chat:conversation-detail", args=[pk])


def messages_url(conversation):
    pk = conversation.pk if isinstance(conversation, Conversation) else conversation
    return reverse("chat:conversation-messages", args=[pk])


def ok(conversa_id="ext-1", resposta=ANSWER):
    return httpx.Response(200, json={"conversa_id": conversa_id, "resposta": resposta})


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def others_conversation(other_user):
    return Conversation.objects.create(user=other_user, title="Conversa de outra pessoa")


def post_message(api, conversation, content=QUESTION):
    return api.post(messages_url(conversation), {"content": content}, format="json")


# --- Authentication -----------------------------------------------------------------


@pytest.mark.parametrize("method", ["get", "post"])
def test_list_and_create_require_authentication(method):
    assert getattr(APIClient(), method)(list_url()).status_code == 401


def test_messages_require_authentication(conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    assert APIClient().get(messages_url(conversation)).status_code == 401
    response = APIClient().post(messages_url(conversation), {"content": QUESTION})
    assert response.status_code == 401
    assert not route.called


def test_post_message_requires_csrf_token(user, conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL)
    client = APIClient(enforce_csrf_checks=True)
    client.force_login(user)

    response = post_message(client, conversation)

    assert response.status_code == 403
    assert not route.called
    assert conversation.messages.count() == 0


# --- Conversations CRUD -------------------------------------------------------------


def test_list_only_own_active_conversations(api, user, conversation, others_conversation):
    newer = Conversation.objects.create(user=user, title="Mais recente")
    deleted = Conversation.objects.create(user=user, title="Apagada")
    soft_delete_conversation(deleted)

    response = api.get(list_url())

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 2
    assert [c["id"] for c in body["results"]] == [str(newer.id), str(conversation.id)]
    assert set(body["results"][0]) == CONVERSATION_FIELDS


def test_create_conversation(api, user):
    response = api.post(list_url(), {"title": "Agenda da semana"}, format="json")

    assert response.status_code == 201
    body = response.json()
    assert set(body) == CONVERSATION_FIELDS
    assert body["title"] == "Agenda da semana"
    assert body["status"] == "active"
    assert Conversation.objects.get(pk=body["id"]).user == user


def test_create_conversation_ignores_status_and_internal_fields(api):
    response = api.post(
        list_url(),
        {"status": "archived", "external_conversation_id": "injetado", "summary": "x"},
        format="json",
    )

    assert response.status_code == 201
    conversation = Conversation.objects.get(pk=response.json()["id"])
    assert conversation.status == Conversation.Status.ACTIVE
    assert conversation.external_conversation_id == ""
    assert conversation.summary == ""


def test_retrieve_own_conversation(api, conversation):
    response = api.get(detail_url(conversation))

    assert response.status_code == 200
    assert response.json()["id"] == str(conversation.id)


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_other_users_conversation_is_404(api, others_conversation, method):
    response = getattr(api, method)(detail_url(others_conversation), {}, format="json")

    assert response.status_code == 404
    others_conversation.refresh_from_db()
    assert others_conversation.deleted_at is None


@pytest.mark.parametrize("method", ["get", "patch", "delete"])
def test_soft_deleted_conversation_is_404(api, conversation, method):
    soft_delete_conversation(conversation)

    assert getattr(api, method)(detail_url(conversation)).status_code == 404


@pytest.mark.parametrize("pk", [uuid.uuid4(), "nao-e-uuid"])
def test_unknown_conversation_is_404(api, pk):
    assert api.get(detail_url(pk)).status_code == 404


def test_patch_updates_title_and_status_only(api, conversation):
    conversation.external_conversation_id = "ext-1"
    conversation.save()

    response = api.patch(
        detail_url(conversation),
        {
            "title": "Novo título",
            "status": "archived",
            "external_conversation_id": "injetado",
            "summary": "injetado",
            "deleted_at": "2026-01-01T00:00:00Z",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Novo título"
    conversation.refresh_from_db()
    assert conversation.title == "Novo título"
    assert conversation.status == Conversation.Status.ARCHIVED
    assert conversation.external_conversation_id == "ext-1"
    assert conversation.summary == ""
    assert conversation.deleted_at is None


def test_patch_rejects_invalid_status(api, conversation):
    response = api.patch(detail_url(conversation), {"status": "apagada"}, format="json")

    assert response.status_code == 400


def test_put_is_not_allowed(api, conversation):
    response = api.put(detail_url(conversation), {"title": "x"}, format="json")

    assert response.status_code == 405


def test_delete_is_soft(api, conversation):
    append_message(conversation, "user", QUESTION)

    response = api.delete(detail_url(conversation))

    assert response.status_code == 204
    conversation.refresh_from_db()
    assert conversation.deleted_at is not None
    assert conversation.messages.count() == 1
    assert api.get(detail_url(conversation)).status_code == 404


# --- Listing messages ---------------------------------------------------------------


def test_list_messages_ordered_by_seq(api, conversation):
    for i in range(3):
        append_message(conversation, "user" if i % 2 == 0 else "assistant", f"Mensagem {i}")

    response = api.get(messages_url(conversation))

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 3
    assert [m["seq"] for m in body["results"]] == [1, 2, 3]
    assert set(body["results"][0]) == MESSAGE_FIELDS


def test_list_messages_is_paginated(api, conversation):
    for i in range(5):
        append_message(conversation, "user", f"Mensagem {i}")

    response = api.get(messages_url(conversation), {"page": 2, "page_size": 2})

    body = response.json()
    assert body["count"] == 5
    assert [m["seq"] for m in body["results"]] == [3, 4]
    assert body["next"] and body["previous"]


def test_list_messages_of_other_user_is_404(api, others_conversation):
    append_message(others_conversation, "user", QUESTION)

    response = api.get(messages_url(others_conversation))

    assert response.status_code == 404
    assert QUESTION not in response.content.decode()


def test_list_messages_of_soft_deleted_conversation_is_404(api, conversation):
    soft_delete_conversation(conversation)

    assert api.get(messages_url(conversation)).status_code == 404


# --- Sending messages ---------------------------------------------------------------


def test_first_message_returns_both_messages_and_stores_external_id(api, conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok("ext-1"))

    response = post_message(api, conversation)

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {"user_message", "assistant_message"}
    assert set(body["user_message"]) == MESSAGE_FIELDS
    assert (body["user_message"]["seq"], body["user_message"]["role"]) == (1, "user")
    assert body["user_message"]["content"] == QUESTION
    assert (body["assistant_message"]["seq"], body["assistant_message"]["role"]) == (
        2,
        "assistant",
    )
    assert body["assistant_message"]["content"] == ANSWER
    assert json.loads(route.calls.last.request.content)["conversa_id"] is None
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-1"
    assert "ext-1" not in response.content.decode()


def test_second_message_reuses_external_id(api, conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok("ext-1"))

    post_message(api, conversation)
    response = post_message(api, conversation, "E na sexta?")

    assert response.status_code == 201
    assert response.json()["user_message"]["seq"] == 3
    assert [json.loads(c.request.content)["conversa_id"] for c in route.calls] == [None, "ext-1"]


def test_expired_external_id_is_restarted(api, conversation, respx_mock):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        side_effect=[httpx.Response(404), ok("ext-new")]
    )

    response = post_message(api, conversation)

    assert response.status_code == 201
    assert [json.loads(c.request.content)["conversa_id"] for c in route.calls] == [
        "ext-old",
        None,
    ]
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-new"


def test_expired_twice_returns_502_and_keeps_user_message(api, conversation, respx_mock):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(404))

    response = post_message(api, conversation)

    assert response.status_code == 502
    assert response.json() == {"detail": AGENT_UNAVAILABLE_MESSAGE}
    assert route.call_count == 2
    saved = api.get(messages_url(conversation)).json()["results"]
    assert [(m["role"], m["content"]) for m in saved] == [("user", QUESTION)]


@pytest.mark.parametrize(
    "side_effect",
    [httpx.Response(502), httpx.Response(500), httpx.ReadTimeout("timeout")],
    ids=["502", "500", "timeout"],
)
def test_upstream_failure_returns_502_and_logs_error(
    api, conversation, respx_mock, caplog, side_effect
):
    respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=[side_effect])

    with caplog.at_level(logging.DEBUG):
        response = post_message(api, conversation)

    assert response.status_code == 502
    assert response.json() == {"detail": AGENT_UNAVAILABLE_MESSAGE}
    assert list(conversation.messages.values_list("role", "content")) == [("user", QUESTION)]
    errors = [
        r for r in caplog.records if r.levelno == logging.ERROR and r.name == "chat.services.agent"
    ]
    assert len(errors) == 1
    assert str(conversation.id) in errors[0].getMessage()
    assert QUESTION not in caplog.text


def test_archived_conversation_rejects_message_before_calling_agent(api, conversation, respx_mock):
    conversation.status = Conversation.Status.ARCHIVED
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL)

    response = post_message(api, conversation)

    assert response.status_code == 400
    assert "arquivada" in response.json()["detail"]
    assert not route.called
    assert conversation.messages.count() == 0


@pytest.mark.parametrize("payload", [{"content": ""}, {"content": "   \n"}, {}])
def test_blank_content_is_400(api, conversation, respx_mock, payload):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    response = api.post(messages_url(conversation), payload, format="json")

    assert response.status_code == 400
    assert "content" in response.json()
    assert not route.called
    assert conversation.messages.count() == 0


def test_too_long_content_is_400(api, conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    response = post_message(api, conversation, "a" * 5001)

    assert response.status_code == 400
    assert not route.called


def test_post_message_to_soft_deleted_conversation_is_404(api, conversation, respx_mock):
    soft_delete_conversation(conversation)
    route = respx_mock.post(REALOCAI_CHAT_URL)

    assert post_message(api, conversation).status_code == 404
    assert not route.called
    assert conversation.messages.count() == 0


def test_post_message_to_other_users_conversation_is_404(api, others_conversation, respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    assert post_message(api, others_conversation).status_code == 404
    assert not route.called
    assert others_conversation.messages.count() == 0


# --- Secrets never leak -------------------------------------------------------------


@pytest.mark.parametrize(
    "side_effect",
    [
        [ok("ext-1")],
        [httpx.Response(404), ok("ext-2")],
        [httpx.Response(401)],
        [httpx.Response(502)],
        [httpx.ConnectError("refused")],
    ],
    ids=["success", "expired-restart", "401", "502", "connect-error"],
)
def test_api_key_never_in_responses_or_logs(api, conversation, respx_mock, caplog, side_effect):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=side_effect)

    with caplog.at_level(logging.DEBUG):
        responses = [
            post_message(api, conversation),
            api.get(messages_url(conversation)),
            api.get(detail_url(conversation)),
            api.get(list_url()),
        ]

    for response in responses:
        assert REALOCAI_API_KEY not in response.content.decode()
        assert "external_conversation_id" not in response.content.decode()
    assert REALOCAI_API_KEY not in caplog.text
    assert settings.REALOCAI_API_KEY == REALOCAI_API_KEY  # the fixture was active


def test_message_serializer_exposes_no_internal_fields(api, conversation):
    append_message(
        conversation,
        Message.Role.ASSISTANT,
        ANSWER,
        model="modelo-ficticio",
        prompt_tokens=10,
        completion_tokens=5,
        metadata={"interno": True},
    )

    result = api.get(messages_url(conversation)).json()["results"][0]

    assert set(result) == MESSAGE_FIELDS
