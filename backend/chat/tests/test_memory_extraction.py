import json
import logging

import httpx
import openai
import pytest

from chat.models import Conversation, Memory
from chat.services.conversations import add_memory, append_message
from chat.services.memory_extraction import (
    EXTRACTION_SCHEMA,
    EXTRACTION_SYSTEM_PROMPT,
    MAX_MESSAGES_PER_EXTRACTION,
    extract_memories,
)

from .conftest import OPENAI_API_KEY

pytestmark = pytest.mark.django_db

# Fictitious data only.
QUESTION = "Quais horários de fisioterapia a Dra. Fictícia tem amanhã? Prefiro lista curta."
ANSWER = "A Dra. Fictícia tem horários às 9h e às 14h."
SUMMARY = "Consulta de horários de fisioterapia para o dia seguinte."
MEMORIES = [
    {"kind": "preference", "content": "Prefere respostas em lista curta.", "importance": 4},
    {
        "kind": "fact",
        "content": "Consulta com frequência a agenda de fisioterapia.",
        "importance": 3,
    },
]


def exchange(conversation, question=QUESTION, answer=ANSWER):
    append_message(conversation, "user", question)
    return append_message(conversation, "assistant", answer)


def test_no_new_messages_does_not_call_openai(fake_openai, conversation):
    extract_memories(conversation)

    assert fake_openai.calls == []


def test_already_processed_messages_do_not_call_openai(fake_openai, conversation):
    last = exchange(conversation)
    Conversation.objects.filter(pk=conversation.pk).update(memory_extracted_seq=last.seq)

    extract_memories(conversation)

    assert fake_openai.calls == []


def test_extracted_memories_are_stored(fake_openai, conversation, user):
    last = exchange(conversation)
    fake_openai.output = {"memories": MEMORIES, "summary": SUMMARY}

    extract_memories(conversation)

    stored = list(
        Memory.objects.filter(user=user)
        .order_by("-importance")
        .values("kind", "content", "importance", "source_message")
    )
    assert stored == [
        {**MEMORIES[0], "source_message": last.pk},
        {**MEMORIES[1], "source_message": last.pk},
    ]
    assert all(memory.is_active for memory in Memory.objects.all())


def test_summary_and_seq_are_updated_without_touching_updated_at(fake_openai, conversation):
    last = exchange(conversation)
    conversation.refresh_from_db()
    updated_at = conversation.updated_at
    fake_openai.output = {"memories": [], "summary": SUMMARY}

    extract_memories(conversation)

    conversation.refresh_from_db()
    assert conversation.summary == SUMMARY
    assert conversation.memory_extracted_seq == last.seq == 2
    assert conversation.updated_at == updated_at
    assert Memory.objects.count() == 0


def test_summary_is_replaced_not_concatenated(fake_openai, conversation):
    exchange(conversation)
    fake_openai.output = {"memories": [], "summary": "Primeiro resumo."}
    extract_memories(conversation)
    exchange(conversation, "E na sexta?", "Na sexta há horário às 10h.")
    fake_openai.output = {"memories": [], "summary": "Segundo resumo."}

    extract_memories(conversation)

    conversation.refresh_from_db()
    assert conversation.summary == "Segundo resumo."
    assert conversation.memory_extracted_seq == 4


def test_empty_summary_keeps_the_previous_one(fake_openai, conversation):
    Conversation.objects.filter(pk=conversation.pk).update(summary="Resumo anterior.")
    exchange(conversation)
    fake_openai.output = {"memories": [], "summary": "  "}

    extract_memories(conversation)

    conversation.refresh_from_db()
    assert conversation.summary == "Resumo anterior."
    assert conversation.memory_extracted_seq == 2


def test_only_new_messages_are_sent(fake_openai, conversation):
    exchange(conversation, "Pergunta antiga", "Resposta antiga")
    Conversation.objects.filter(pk=conversation.pk).update(memory_extracted_seq=2)
    exchange(conversation)
    append_message(conversation, "system", "Instrução interna")
    append_message(conversation, "tool", "Saída de ferramenta")

    extract_memories(conversation)

    (call,) = fake_openai.calls
    transcript = call["messages"][1]["content"]
    assert transcript == f"Profissional: {QUESTION}\n\nAssistente: {ANSWER}"
    conversation.refresh_from_db()
    assert conversation.memory_extracted_seq == 6


def test_pending_messages_are_capped(fake_openai, conversation):
    for n in range(MAX_MESSAGES_PER_EXTRACTION):
        exchange(conversation, f"Pergunta {n}", f"Resposta {n}")

    extract_memories(conversation)

    transcript = fake_openai.calls[0]["messages"][1]["content"]
    assert transcript.count("Profissional:") == MAX_MESSAGES_PER_EXTRACTION // 2
    assert "Pergunta 0\n" not in transcript
    conversation.refresh_from_db()
    assert conversation.memory_extracted_seq == MAX_MESSAGES_PER_EXTRACTION * 2


def test_request_uses_strict_schema_and_configured_model(fake_openai, conversation):
    exchange(conversation)

    extract_memories(conversation)

    (call,) = fake_openai.calls
    assert call["model"] == "gpt-test-model"
    assert call["messages"][0] == {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT}
    assert call["response_format"]["type"] == "json_schema"
    assert call["response_format"]["json_schema"]["strict"] is True
    assert call["response_format"]["json_schema"]["schema"] == EXTRACTION_SCHEMA
    assert call["store"] is False


def test_system_prompt_forbids_patient_data():
    assert "NUNCA extraia nomes de pacientes" in EXTRACTION_SYSTEM_PROMPT
    assert "diagnósticos, condições de saúde" in EXTRACTION_SYSTEM_PROMPT
    assert "qualquer informação que identifique um paciente" in EXTRACTION_SYSTEM_PROMPT
    assert "devolva memories como uma lista vazia" in EXTRACTION_SYSTEM_PROMPT
    assert "sem incluir dados de pacientes" in EXTRACTION_SYSTEM_PROMPT


def test_disabled_without_api_key(fake_openai, settings, conversation):
    settings.OPENAI_API_KEY = ""
    exchange(conversation)

    extract_memories(conversation)

    assert fake_openai.calls == []
    conversation.refresh_from_db()
    assert conversation.memory_extracted_seq == 0


def test_summary_and_memory_content_are_truncated(fake_openai, conversation):
    exchange(conversation)
    fake_openai.output = {
        "memories": [{"kind": "fact", "content": "x" * 1000, "importance": 2}],
        "summary": "y" * 1000,
    }

    extract_memories(conversation)

    conversation.refresh_from_db()
    assert len(conversation.summary) == 500
    assert len(Memory.objects.get().content) == 300


def test_duplicate_active_memory_is_not_stored_again(fake_openai, conversation, user):
    add_memory(user, "preference", "prefere respostas em lista curta.", importance=4)
    exchange(conversation)
    fake_openai.output = {"memories": MEMORIES[:1], "summary": SUMMARY}

    extract_memories(conversation)

    assert Memory.objects.filter(user=user).count() == 1


def test_concurrent_extraction_does_not_duplicate(fake_openai, conversation):
    exchange(conversation)
    fake_openai.output = {"memories": MEMORIES, "summary": SUMMARY}
    original_create = fake_openai.chat.completions.create

    def create_while_another_extraction_finishes(**kwargs):
        # Simulates another request committing the same range meanwhile.
        Conversation.objects.filter(pk=conversation.pk).update(memory_extracted_seq=2)
        return original_create(**kwargs)

    fake_openai.chat.completions.create = create_while_another_extraction_finishes

    extract_memories(conversation)

    assert Memory.objects.count() == 0
    conversation.refresh_from_db()
    assert conversation.summary == ""


@pytest.mark.parametrize(
    "failure",
    [
        "api-error",
        "timeout",
        "invalid-json",
        "wrong-shape",
        "invalid-kind",
        "importance-out-of-range",
    ],
)
def test_failures_are_logged_and_never_raise(fake_openai, conversation, caplog, failure):
    exchange(conversation)
    request = httpx.Request("POST", "https://api.openai.test/v1/chat/completions")
    if failure == "api-error":
        fake_openai.error = openai.APIStatusError(
            f"boom {QUESTION}", response=httpx.Response(500, request=request), body=None
        )
    elif failure == "timeout":
        fake_openai.error = openai.APITimeoutError(request=request)
    elif failure == "invalid-json":
        fake_openai.output = f'{{"summary": "{QUESTION}"'
    elif failure == "wrong-shape":
        fake_openai.output = {"summary": SUMMARY}
    elif failure == "invalid-kind":
        fake_openai.output = {
            "memories": [{"kind": "summary", "content": "x", "importance": 3}],
            "summary": SUMMARY,
        }
    else:
        fake_openai.output = {
            "memories": [{"kind": "fact", "content": "x", "importance": 9}],
            "summary": SUMMARY,
        }

    with caplog.at_level(logging.DEBUG):
        extract_memories(conversation)  # must not raise

    assert Memory.objects.count() == 0
    conversation.refresh_from_db()
    assert conversation.memory_extracted_seq == 0  # retried on the next turn
    assert conversation.summary == ""
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert len(errors) == 1
    assert str(conversation.id) in errors[0].getMessage()
    for secret in (QUESTION, ANSWER, SUMMARY, OPENAI_API_KEY):
        assert secret not in caplog.text


def test_success_logs_no_contents(fake_openai, conversation, caplog):
    exchange(conversation)
    fake_openai.output = {"memories": MEMORIES, "summary": SUMMARY}

    with caplog.at_level(logging.DEBUG):
        extract_memories(conversation)

    for text in (QUESTION, ANSWER, SUMMARY, OPENAI_API_KEY, *(m["content"] for m in MEMORIES)):
        assert text not in caplog.text


def test_schema_is_strict():
    item = EXTRACTION_SCHEMA["properties"]["memories"]["items"]
    assert EXTRACTION_SCHEMA["additionalProperties"] is False
    assert item["additionalProperties"] is False
    assert set(item["required"]) == set(item["properties"])
    assert item["properties"]["kind"]["enum"] == ["fact", "preference"]
    assert json.dumps(EXTRACTION_SCHEMA)  # serializable as sent to the API
