"""Long-term memory extraction with the OpenAI API (Structured Outputs).

After each chat turn, the messages not processed yet are sent to OpenAI, which returns
facts/preferences about how the *professional* uses the system plus a short summary
of the exchange. This is the only place where Django calls OpenAI directly; the chat
itself goes through RealocAI.

LGPD guardrail: the system prompt forbids extracting patient data, since memories are
tied to the professional's account and reused across conversations.

Logging rule: message contents, model output and the API key are never logged; only
the conversation id and the error type.
"""

import json
import logging

from django.conf import settings
from django.db import transaction
from openai import OpenAI

from chat.models import Conversation, Memory, Message
from chat.services.conversations import add_memory

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = (
    "Você analisa uma troca de mensagens entre um profissional de uma clínica "
    "multidisciplinar e um assistente de agendamento. Extraia apenas fatos e "
    "preferências sobre COMO ESSE PROFISSIONAL usa o sistema — por exemplo, "
    "especialidades que costuma consultar, formato de resposta que prefere, "
    "atalhos ou rotinas que usa. NUNCA extraia nomes de pacientes, datas de "
    "nascimento, diagnósticos, condições de saúde ou qualquer informação que "
    "identifique um paciente, mesmo que apareçam na conversa. Se a troca só "
    "contiver informação sobre pacientes, sem nada sobre o próprio profissional, "
    "devolva memories como uma lista vazia. Gere também um resumo curto (até "
    "500 caracteres) do que foi discutido nesta troca, sem incluir dados de "
    "pacientes, útil para retomar o contexto depois."
)

EXTRACTION_KINDS = (Memory.Kind.FACT.value, Memory.Kind.PREFERENCE.value)
IMPORTANCE_VALUES = (1, 2, 3, 4, 5)

# Strict Structured Outputs: every property required, no extra properties.
EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "memories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": list(EXTRACTION_KINDS)},
                    "content": {"type": "string"},
                    "importance": {"type": "integer", "enum": list(IMPORTANCE_VALUES)},
                },
                "required": ["kind", "content", "importance"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["memories", "summary"],
    "additionalProperties": False,
}

SUMMARY_MAX_LENGTH = 500
MEMORY_MAX_LENGTH = 300
# Bounds the prompt (and the cost) when many messages are pending, e.g. after the
# extraction was disabled for a while. Older pending messages are skipped.
MAX_MESSAGES_PER_EXTRACTION = 20
# Runs inside the chat request, after RealocAI answered: fail fast, never retry.
EXTRACTION_TIMEOUT_SECONDS = 20

_ROLE_LABELS = {Message.Role.USER: "Profissional", Message.Role.ASSISTANT: "Assistente"}


class ExtractionError(Exception):
    """The model output could not be used."""


def extract_memories(conversation):
    """Extract memories and a summary from messages not processed yet.

    Never raises: the chat answer was already produced, so any failure is only logged.
    """
    try:
        _extract(conversation)
    except Exception as exc:  # noqa: BLE001 - must never break the chat response
        # Only the exception type: its message could echo model output or contents.
        logger.error(
            "Memory extraction failed (conversation=%s, error=%s)",
            conversation.id,
            type(exc).__name__,
        )


def _extract(conversation):
    # Read from the database: the caller's instance may be stale.
    start = (
        Conversation.objects.filter(pk=conversation.pk)
        .values_list("memory_extracted_seq", flat=True)
        .get()
    )
    newest = conversation.messages.filter(seq__gt=start).order_by("-seq")
    messages = list(newest[:MAX_MESSAGES_PER_EXTRACTION])
    if not messages:
        return
    if not settings.OPENAI_API_KEY:
        # Disabled: leave the messages pending for when it is configured.
        return

    messages.reverse()
    last = messages[-1]
    transcript = _build_transcript(messages)
    memories, summary = _call_model(transcript) if transcript else ([], "")

    with transaction.atomic():
        updates = {"memory_extracted_seq": last.seq}
        if summary:
            updates["summary"] = summary
        # QuerySet.update() leaves updated_at alone (auto_now only runs on save()).
        # The seq check skips the write when a concurrent extraction got here first,
        # so the same messages never produce duplicated memories.
        claimed = Conversation.objects.filter(
            pk=conversation.pk, memory_extracted_seq=start
        ).update(**updates)
        if not claimed:
            return
        for item in memories:
            if _is_duplicate(conversation.user_id, item):
                continue
            add_memory(
                user=conversation.user,
                kind=item["kind"],
                content=item["content"],
                source_message=last,
                importance=item["importance"],
            )

    conversation.memory_extracted_seq = last.seq
    if summary:
        conversation.summary = summary


def _build_transcript(messages):
    return "\n\n".join(
        f"{_ROLE_LABELS[message.role]}: {message.content}"
        for message in messages
        if message.role in _ROLE_LABELS
    )


def _get_client():
    return OpenAI(
        api_key=settings.OPENAI_API_KEY,
        timeout=EXTRACTION_TIMEOUT_SECONDS,
        max_retries=0,
    )


def _call_model(transcript):
    completion = _get_client().chat.completions.create(
        model=settings.OPENAI_EXTRACTION_MODEL,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "memory_extraction",
                "strict": True,
                "schema": EXTRACTION_SCHEMA,
            },
        },
        # Health data: do not keep the completion on OpenAI's side.
        store=False,
    )
    message = completion.choices[0].message
    if getattr(message, "refusal", None) or not message.content:
        raise ExtractionError("empty or refused completion")
    return _parse_output(json.loads(message.content))


def _parse_output(data):
    """Validate the model output (defense in depth on top of the strict schema)."""
    if not isinstance(data, dict):
        raise ExtractionError("output is not an object")
    items, summary = data.get("memories"), data.get("summary")
    if not isinstance(items, list) or not isinstance(summary, str):
        raise ExtractionError("missing memories or summary")

    memories = []
    for item in items:
        if not isinstance(item, dict):
            raise ExtractionError("memory is not an object")
        kind, content, importance = item.get("kind"), item.get("content"), item.get("importance")
        valid = (
            kind in EXTRACTION_KINDS
            and isinstance(content, str)
            and content.strip()
            and type(importance) is int
            and importance in IMPORTANCE_VALUES
        )
        if not valid:
            raise ExtractionError("invalid memory item")
        memories.append(
            {
                "kind": kind,
                "content": content.strip()[:MEMORY_MAX_LENGTH],
                "importance": importance,
            }
        )
    return memories, summary.strip()[:SUMMARY_MAX_LENGTH]


def _is_duplicate(user_id, item):
    return Memory.objects.filter(
        user_id=user_id,
        is_active=True,
        kind=item["kind"],
        content__iexact=item["content"],
    ).exists()
