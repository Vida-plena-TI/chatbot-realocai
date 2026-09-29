import json
import logging
import threading
import time

import httpx
import pytest
from django.db import connection

from chat.models import Conversation, Message
from chat.services import agent
from chat.services.agent import (
    AGENT_UNAVAILABLE_MESSAGE,
    AgentUnavailableError,
    exchange_messages,
    send_user_message,
)
from chat.services.conversations import add_memory, deactivate_memory
from chat.services.realocai_client import ChatSuccess

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL

pytestmark = pytest.mark.django_db

QUESTION = "Quais horários a Dra. Fictícia tem livres amanhã?"
ANSWER = "A Dra. Fictícia tem horários às 9h e às 14h."


def ok(conversa_id="ext-1", resposta=ANSWER):
    return httpx.Response(200, json={"conversa_id": conversa_id, "resposta": resposta})


def sent_ids(route):
    return [json.loads(call.request.content)["conversa_id"] for call in route.calls]


def test_first_message_starts_realocai_conversation(respx_mock, conversation):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok("ext-1"))

    assistant = send_user_message(conversation, QUESTION)

    assert sent_ids(route) == [None]
    assert assistant.role == Message.Role.ASSISTANT
    assert assistant.content == ANSWER
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-1"
    assert list(conversation.messages.values_list("seq", "role", "content")) == [
        (1, "user", QUESTION),
        (2, "assistant", ANSWER),
    ]


def test_second_message_reuses_external_id(respx_mock, conversation):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok("ext-1"))

    send_user_message(conversation, QUESTION)
    send_user_message(conversation, "E na sexta?")

    assert sent_ids(route) == [None, "ext-1"]
    assert json.loads(route.calls.last.request.content)["mensagem"] == "E na sexta?"
    assert conversation.messages.count() == 4


def test_exchange_returns_both_messages(respx_mock, conversation):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    exchange = exchange_messages(conversation, QUESTION)

    assert (exchange.user_message.seq, exchange.user_message.content) == (1, QUESTION)
    assert (exchange.assistant_message.seq, exchange.assistant_message.content) == (2, ANSWER)


def test_expired_conversation_restarts_once(respx_mock, conversation, caplog):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        side_effect=[httpx.Response(404, json={"detail": "x"}), ok("ext-new")]
    )

    assistant = send_user_message(conversation, QUESTION)

    assert sent_ids(route) == ["ext-old", None]
    assert assistant.content == ANSWER
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-new"
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


def test_expired_twice_raises_and_keeps_user_message(respx_mock, conversation, caplog):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(404))

    with pytest.raises(AgentUnavailableError) as excinfo:
        send_user_message(conversation, QUESTION)

    assert str(excinfo.value) == AGENT_UNAVAILABLE_MESSAGE
    assert route.call_count == 2
    assert list(conversation.messages.values_list("role", flat=True)) == ["user"]
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == ""
    assert "expired" in caplog.text


def test_expired_without_external_id_is_not_retried(respx_mock, conversation):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(404))

    with pytest.raises(AgentUnavailableError):
        send_user_message(conversation, QUESTION)

    assert route.call_count == 1


@pytest.mark.parametrize(
    "side_effect",
    [
        httpx.Response(502),
        httpx.Response(500),
        httpx.Response(422),
        httpx.Response(401),
        httpx.ReadTimeout("timeout"),
        httpx.ConnectError("refused"),
    ],
    ids=["502", "500", "422", "401", "timeout", "connect-error"],
)
def test_failure_raises_logs_error_and_keeps_user_message(
    respx_mock, conversation, caplog, side_effect
):
    conversation.external_conversation_id = "ext-1"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=[side_effect])

    with caplog.at_level(logging.DEBUG), pytest.raises(AgentUnavailableError):
        send_user_message(conversation, QUESTION)

    assert route.call_count == 1
    assert list(conversation.messages.values_list("role", flat=True)) == ["user"]
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-1"

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert str(conversation.id) in errors[0].getMessage()
    # No health data nor secrets in the logs.
    assert QUESTION not in caplog.text
    assert REALOCAI_API_KEY not in caplog.text


def test_logs_never_contain_contents_or_key(respx_mock, conversation, caplog):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=[httpx.Response(404), ok("ext-new")])

    with caplog.at_level(logging.DEBUG):
        send_user_message(conversation, QUESTION)

    for text in (QUESTION, ANSWER, REALOCAI_API_KEY):
        assert text not in caplog.text


@pytest.mark.parametrize("content", ["", "   ", "\n\t", None])
def test_blank_content_is_rejected_before_anything(respx_mock, conversation, content):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    with pytest.raises(ValueError):
        send_user_message(conversation, content)

    assert not route.called
    assert conversation.messages.count() == 0


@pytest.mark.django_db(transaction=True)
def test_concurrent_first_messages_open_a_single_realocai_conversation(monkeypatch, conversation):
    threads_count = 5
    barrier = threading.Barrier(threads_count)
    calls_lock = threading.Lock()
    sent = []
    errors = []

    def fake_send(conversa_id, mensagem):
        with calls_lock:
            sent.append(conversa_id)
        # Widen the race window: without the row lock every thread would get here
        # with conversa_id=None before the first one stores the new id.
        time.sleep(0.5)
        return ChatSuccess(conversa_id=conversa_id or "ext-new", resposta=ANSWER)

    monkeypatch.setattr(agent, "send_chat_message", fake_send)

    def worker(n):
        try:
            # Like separate HTTP requests, each thread loads its own instance.
            own = Conversation.objects.get(pk=conversation.pk)
            barrier.wait()
            send_user_message(own, f"Pergunta {n}")
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(threads_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert sent.count(None) == 1
    assert sorted(sent, key=str) == [None] + ["ext-new"] * (threads_count - 1)
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-new"
    assert conversation.messages.count() == threads_count * 2


def test_extraction_runs_after_a_successful_turn(respx_mock, conversation, fake_openai):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    (call,) = fake_openai.calls
    assert call["messages"][1]["content"] == f"Profissional: {QUESTION}\n\nAssistente: {ANSWER}"


def test_extraction_is_skipped_when_the_agent_fails(respx_mock, conversation, fake_openai):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(500))

    with pytest.raises(AgentUnavailableError):
        send_user_message(conversation, QUESTION)

    assert fake_openai.calls == []


def test_extraction_failure_still_returns_the_answer(respx_mock, conversation, fake_openai):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())
    fake_openai.error = RuntimeError("boom")

    exchange = exchange_messages(conversation, QUESTION)

    assert exchange.assistant_message.content == ANSWER


# --- Context injection (REALOCAI_INJECT_MEMORIES) -------------------------------------

CONTEXT_HEADER = "[Contexto — não repita isto ao usuário: "


def sent_messages(route):
    return [json.loads(call.request.content)["mensagem"] for call in route.calls]


@pytest.fixture
def known_context(user, other_user, conversation):
    Conversation.objects.filter(pk=conversation.pk).update(summary="Consulta de horários.")
    conversation.refresh_from_db()
    add_memory(user, "preference", "Prefere listas curtas.", importance=5)
    add_memory(user, "fact", "Consulta a agenda de fisioterapia.", importance=4)
    add_memory(other_user, "fact", "Memória de outra pessoa.", importance=5)


def test_injection_disabled_by_default_sends_content_unchanged(
    respx_mock, conversation, known_context
):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    assert sent_messages(route) == [QUESTION]


def test_injection_prefixes_first_message_of_new_conversation(
    respx_mock, settings, conversation, known_context
):
    settings.REALOCAI_INJECT_MEMORIES = True
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    assert sent_messages(route) == [
        CONTEXT_HEADER + "Consulta de horários. Preferências conhecidas: "
        "Prefere listas curtas.; Consulta a agenda de fisioterapia.]\n" + QUESTION
    ]
    # The stored message is the one the user typed.
    assert conversation.messages.get(seq=1).content == QUESTION


def test_injection_skips_existing_conversation(respx_mock, settings, conversation, known_context):
    settings.REALOCAI_INJECT_MEMORIES = True
    Conversation.objects.filter(pk=conversation.pk).update(external_conversation_id="ext-1")
    conversation.refresh_from_db()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok("ext-1"))

    send_user_message(conversation, QUESTION)

    assert sent_messages(route) == [QUESTION]


def test_injection_applies_when_expired_conversation_restarts(
    respx_mock, settings, conversation, known_context
):
    settings.REALOCAI_INJECT_MEMORIES = True
    Conversation.objects.filter(pk=conversation.pk).update(external_conversation_id="ext-old")
    conversation.refresh_from_db()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        side_effect=[httpx.Response(404), ok("ext-new")]
    )

    send_user_message(conversation, QUESTION)

    first, retry = sent_messages(route)
    assert first == QUESTION
    assert retry.startswith(CONTEXT_HEADER + "Consulta de horários. ")
    assert retry.endswith("]\n" + QUESTION)


def test_injection_omits_empty_parts(respx_mock, settings, user, conversation):
    settings.REALOCAI_INJECT_MEMORIES = True
    add_memory(user, "preference", "Prefere listas curtas.")
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    assert sent_messages(route) == [
        CONTEXT_HEADER + "Preferências conhecidas: Prefere listas curtas.]\n" + QUESTION
    ]


def test_injection_without_context_sends_content_unchanged(respx_mock, settings, conversation):
    settings.REALOCAI_INJECT_MEMORIES = True
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    assert sent_messages(route) == [QUESTION]


def test_injection_uses_top_five_active_memories(respx_mock, settings, user, conversation):
    settings.REALOCAI_INJECT_MEMORIES = True
    for n in range(1, 7):
        add_memory(user, "fact", f"Fato {n}.", importance=min(n, 5))
    deactivate_memory(add_memory(user, "fact", "Fato inativo.", importance=5))
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    (sent,) = sent_messages(route)
    assert "Fato inativo." not in sent
    assert "Fato 1." not in sent
    assert sent.count("Fato ") == 5
