import json
import logging
import threading
import time
from datetime import timedelta

import httpx
import pytest
from django.db import connection
from django.utils import timezone

from chat.models import Conversation, Message
from chat.services import agent
from chat.services.agent import (
    AGENT_UNAVAILABLE_MESSAGE,
    PROPOSAL_APPROVED_REPLY,
    PROPOSAL_REJECTED_REPLY,
    AgentUnavailableError,
    ConversationBusyError,
    exchange_messages,
    send_user_message,
)
from chat.services.content import summarize
from chat.services.conversations import add_memory, deactivate_memory
from chat.services.realocai_client import ChatSuccess

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL
from .test_realocai_client import load_fixture

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


def test_expired_twice_raises_and_stores_nothing(respx_mock, conversation, caplog):
    conversation.external_conversation_id = "ext-old"
    conversation.save()
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(404))

    with pytest.raises(AgentUnavailableError) as excinfo:
        send_user_message(conversation, QUESTION)

    assert str(excinfo.value) == AGENT_UNAVAILABLE_MESSAGE == "O agente não respondeu a tempo."
    assert route.call_count == 2
    assert conversation.messages.count() == 0
    conversation.refresh_from_db()
    # Only updated after a success.
    assert conversation.external_conversation_id == "ext-old"
    assert conversation.processing_started_at is None
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
        httpx.Response(200, json={"resposta": "sem id"}),
    ],
    ids=["502", "500", "422", "401", "timeout", "connect-error", "malformed"],
)
def test_failure_raises_logs_error_and_stores_nothing(
    respx_mock, conversation, caplog, side_effect
):
    conversation.external_conversation_id = "ext-1"
    conversation.save()
    before = Conversation.objects.get(pk=conversation.pk)
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=[side_effect])

    with caplog.at_level(logging.DEBUG), pytest.raises(AgentUnavailableError):
        send_user_message(conversation, QUESTION)

    assert route.call_count == 1
    # Not even the question is stored, and the conversation is untouched.
    assert conversation.messages.count() == 0
    after = Conversation.objects.get(pk=conversation.pk)
    assert after.external_conversation_id == "ext-1"
    assert (after.title, after.preview, after.updated_at) == (
        before.title,
        before.preview,
        before.updated_at,
    )
    assert after.processing_started_at is None

    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    logged = errors[0].getMessage()
    assert str(conversation.id) in logged
    assert "duration_ms=" in logged
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
    busy = []
    errors = []

    def fake_send(conversa_id, mensagem):
        with calls_lock:
            sent.append(conversa_id)
        # Widen the race window: every other thread tries while this one is in flight.
        time.sleep(0.5)
        return ChatSuccess(conversa_id=conversa_id or "ext-new", resposta=ANSWER)

    monkeypatch.setattr(agent, "send_chat_message", fake_send)

    def worker(n):
        try:
            # Like separate HTTP requests, each thread loads its own instance.
            own = Conversation.objects.get(pk=conversation.pk)
            barrier.wait()
            send_user_message(own, f"Pergunta {n}")
        except ConversationBusyError as exc:
            busy.append(exc)
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
    # Exactly one request won the claim; the others got a 409 without calling RealocAI.
    assert sent == [None]
    assert len(busy) == threads_count - 1
    conversation.refresh_from_db()
    assert conversation.external_conversation_id == "ext-new"
    assert conversation.processing_started_at is None
    assert conversation.messages.count() == 2

    # Once released, the next message reuses the stored conversa_id.
    send_user_message(conversation, "E amanhã?")
    assert sent == [None, "ext-new"]


# --- Claim (409) ------------------------------------------------------------------------


def test_busy_conversation_is_rejected_without_calling_the_agent(respx_mock, conversation):
    claimed_at = timezone.now()
    Conversation.objects.filter(pk=conversation.pk).update(processing_started_at=claimed_at)
    route = respx_mock.post(REALOCAI_CHAT_URL)

    with pytest.raises(ConversationBusyError) as excinfo:
        send_user_message(conversation, QUESTION)

    assert str(excinfo.value) == "Já há uma mensagem sendo processada nesta conversa."
    assert not route.called
    assert conversation.messages.count() == 0
    # The other request's claim is left alone.
    conversation.refresh_from_db()
    assert conversation.processing_started_at == claimed_at


def test_stale_claim_is_taken_over(respx_mock, settings, conversation):
    stale = timezone.now() - timedelta(seconds=settings.REALOCAI_TIMEOUT_SECONDS + 31)
    Conversation.objects.filter(pk=conversation.pk).update(processing_started_at=stale)
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, QUESTION)

    conversation.refresh_from_db()
    assert conversation.processing_started_at is None
    assert conversation.messages.count() == 2


def test_claim_within_the_grace_period_is_respected(respx_mock, settings, conversation):
    recent = timezone.now() - timedelta(seconds=settings.REALOCAI_TIMEOUT_SECONDS + 20)
    Conversation.objects.filter(pk=conversation.pk).update(processing_started_at=recent)
    route = respx_mock.post(REALOCAI_CHAT_URL)

    with pytest.raises(ConversationBusyError):
        send_user_message(conversation, QUESTION)

    assert not route.called


def test_claim_is_released_after_an_unexpected_error(monkeypatch, conversation):
    def boom(conversa_id, mensagem):
        raise RuntimeError("bug")

    monkeypatch.setattr(agent, "send_chat_message", boom)

    with pytest.raises(RuntimeError):
        send_user_message(conversation, QUESTION)

    conversation.refresh_from_db()
    assert conversation.processing_started_at is None
    assert conversation.messages.count() == 0


def test_failed_turn_does_not_touch_updated_at(respx_mock, conversation):
    before = Conversation.objects.get(pk=conversation.pk).updated_at
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=httpx.Response(500))

    with pytest.raises(AgentUnavailableError):
        send_user_message(conversation, QUESTION)

    assert Conversation.objects.get(pk=conversation.pk).updated_at == before


# --- Stored turn: blocks, title, preview --------------------------------------------------


def with_blocks(blocos, resposta=ANSWER):
    return httpx.Response(
        200, json={"conversa_id": "ext-1", "resposta": resposta, "blocos": blocos}
    )


def test_success_stores_two_consecutive_messages_with_blocks(respx_mock, conversation):
    bloco = load_fixture("ocupacao_profissional")
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=with_blocks([bloco]))

    exchange = exchange_messages(conversation, QUESTION)

    assert (exchange.user_message.seq, exchange.assistant_message.seq) == (1, 2)
    assert Message.objects.get(pk=exchange.user_message.pk).blocos == []
    assert Message.objects.get(pk=exchange.assistant_message.pk).blocos == [bloco]


def test_invalid_blocks_are_dropped_with_a_warning(respx_mock, conversation, caplog):
    secret_title = "Título fictício que não pode ir para o log"
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=with_blocks([{"titulo": secret_title}]))

    with caplog.at_level(logging.DEBUG):
        exchange = exchange_messages(conversation, QUESTION)

    assert Message.objects.get(pk=exchange.assistant_message.pk).blocos == []
    assert exchange.assistant_message.content == ANSWER
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == 1
    assert str(conversation.id) in warnings[0].getMessage()
    for text in (secret_title, ANSWER, QUESTION):
        assert text not in caplog.text


def test_first_answer_sets_title_and_preview(respx_mock, user):
    conversation = Conversation.objects.create(user=user)
    proposal = json.dumps({"paciente": "Paciente A", "para": {"horario": "10:00"}})
    answer = f"Encontrei   duas opções.\n\n```proposta\n{proposal}\n```"
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok(resposta=answer))

    send_user_message(conversation, "Quais   horários\nlivres amanhã para a Sala 3?")

    conversation.refresh_from_db()
    assert conversation.title == "Quais horários livres amanhã para a Sala 3?"
    assert conversation.preview == "Encontrei duas opções."
    # The answer itself is stored untouched, proposal block included.
    assert conversation.messages.get(seq=2).content == answer


def test_existing_title_is_kept_and_preview_follows_the_last_answer(respx_mock, conversation):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        side_effect=[ok(resposta="Primeira."), ok(resposta="Segunda.")]
    )

    send_user_message(conversation, QUESTION)
    send_user_message(conversation, "E depois?")

    conversation.refresh_from_db()
    assert conversation.title == "Conversa de teste"
    assert conversation.preview == "Segunda."


# --- Proposal decisions -------------------------------------------------------------------


@pytest.mark.parametrize(
    "content, reply",
    [
        ("Proposta aprovada: Paciente A, 16:30 → 10:00 (Sala 2).", PROPOSAL_APPROVED_REPLY),
        ("Proposta recusada: Paciente A, 16:30 → 10:00 (Sala 2).", PROPOSAL_REJECTED_REPLY),
    ],
    ids=["approved", "rejected"],
)
def test_proposal_decisions_get_a_fixed_reply_without_the_agent(
    respx_mock, conversation, fake_openai, content, reply
):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    exchange = exchange_messages(conversation, content)

    assert not route.called
    assert fake_openai.calls == []  # no memory extraction either
    assert (exchange.user_message.content, exchange.assistant_message.content) == (content, reply)
    assert (exchange.user_message.seq, exchange.assistant_message.seq) == (1, 2)
    conversation.refresh_from_db()
    assert conversation.processing_started_at is None
    assert conversation.preview == summarize(reply)


def test_proposal_replies_are_the_agreed_texts():
    assert PROPOSAL_APPROVED_REPLY == (
        "Registrado. O realocAI não altera a agenda: aplique a mudança no sistema de "
        "agendamento e avise o paciente."
    )
    assert PROPOSAL_REJECTED_REPLY == "Registrado. Quer que eu busque outra opção?"


def test_message_mentioning_a_proposal_mid_text_goes_to_the_agent(respx_mock, conversation):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=ok())

    send_user_message(conversation, "A proposta aprovada ontem ainda vale?")

    assert route.called


def test_proposal_decision_on_busy_conversation_is_rejected(conversation):
    Conversation.objects.filter(pk=conversation.pk).update(processing_started_at=timezone.now())

    with pytest.raises(ConversationBusyError):
        send_user_message(conversation, "Proposta aprovada: Paciente A.")

    assert conversation.messages.count() == 0


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
