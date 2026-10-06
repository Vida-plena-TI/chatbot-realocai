"""Orchestrates a chat turn between our conversation store and the RealocAI agent.

RealocAI keeps its own short-term memory per `conversa_id`; we store that id on
the Conversation and send only the new user message on each turn.

Flow of a turn:
1. validate the content;
2. claim the conversation (atomic conditional UPDATE on processing_started_at); if
   another turn is in flight, raise ConversationBusyError (409);
3. call RealocAI with no transaction open (a 404 for a known conversa_id is retried
   once as a new conversation);
4. on success only, store the user message and the answer in one transaction
   (record_exchange); on failure nothing is stored;
5. release the claim, then extract long-term memories (never raises).

Logging rule: message contents, report blocks and agent answers are health data and
the API key is a secret, so we log ids, error kinds, status codes and durations only.
"""

import logging
import time
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from chat.models import Conversation, Message
from chat.services.conversations import get_active_memories, record_exchange
from chat.services.memory_extraction import extract_memories
from chat.services.realocai_client import (
    ChatErrorKind,
    ChatFailure,
    ChatSuccess,
    send_chat_message,
)

logger = logging.getLogger(__name__)

# Memories sent when a new RealocAI conversation starts (REALOCAI_INJECT_MEMORIES).
CONTEXT_MEMORY_LIMIT = 5

AGENT_UNAVAILABLE_MESSAGE = "O agente não respondeu a tempo."
CONVERSATION_BUSY_MESSAGE = "Já há uma mensagem sendo processada nesta conversa."

# A claim older than the RealocAI read timeout plus this margin belongs to a request
# that died without releasing it (e.g. a killed worker) and can be taken over.
CLAIM_GRACE_SECONDS = 30

# The SPA sends the decision on a proposal card as a user message with these prefixes
# (DECISION in src/utils/content.js). RealocAI never changes the schedule, so these
# get a fixed answer and the agent is not called.
PROPOSAL_APPROVED_PREFIX = "Proposta aprovada"
PROPOSAL_REJECTED_PREFIX = "Proposta recusada"
PROPOSAL_APPROVED_REPLY = (
    "Registrado. O realocAI não altera a agenda: aplique a mudança no sistema de "
    "agendamento e avise o paciente."
)
PROPOSAL_REJECTED_REPLY = "Registrado. Quer que eu busque outra opção?"


class AgentUnavailableError(Exception):
    """RealocAI could not answer. The message is generic and safe to show to users."""

    def __init__(self, message=AGENT_UNAVAILABLE_MESSAGE):
        super().__init__(message)


class ConversationBusyError(Exception):
    """Another message of the same conversation is still being processed."""

    def __init__(self, message=CONVERSATION_BUSY_MESSAGE):
        super().__init__(message)


@dataclass(frozen=True)
class Exchange:
    user_message: Message
    assistant_message: Message


def send_user_message(conversation, content) -> Message:
    """Send `content` to the agent and return the stored assistant message."""
    return exchange_messages(conversation, content).assistant_message


def exchange_messages(conversation, content) -> Exchange:
    """Run one chat turn and return the two stored messages.

    Raises ValueError for blank content, ConversationBusyError when another turn of
    the same conversation is in flight and AgentUnavailableError when RealocAI fails;
    in all these cases nothing is stored.
    """
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Message content must not be blank.")

    claimed_at = _claim(conversation)
    if claimed_at is None:
        raise ConversationBusyError()
    try:
        fixed_reply = proposal_reply(content)
        if fixed_reply is not None:
            # Decisions on proposals are recorded without calling the agent nor
            # extracting memories.
            return Exchange(*record_exchange(conversation, content, fixed_reply))

        # The claim guarantees no other turn runs now; reload what a previous turn
        # may have changed since this instance was loaded.
        conversation.refresh_from_db(fields=["external_conversation_id", "summary"])
        result = _ask_agent(conversation, content)
        if result.blocos_descartados:
            logger.warning(
                "RealocAI sent invalid report blocks; storing none (conversation=%s)",
                conversation.id,
            )
        user_message, assistant_message = record_exchange(
            conversation,
            content,
            result.resposta,
            blocos=result.blocos,
            external_conversation_id=result.conversa_id,
        )
    finally:
        _release(conversation, claimed_at)

    # Synchronous, but never raises: a failed extraction must not turn into a 502.
    extract_memories(conversation)
    return Exchange(user_message, assistant_message)


def proposal_reply(content):
    """Fixed answer for a decision on a proposal, or None for a regular message."""
    text = content.strip()
    if text.startswith(PROPOSAL_APPROVED_PREFIX):
        return PROPOSAL_APPROVED_REPLY
    if text.startswith(PROPOSAL_REJECTED_PREFIX):
        return PROPOSAL_REJECTED_REPLY
    return None


def _claim(conversation):
    """Atomically mark the conversation as busy; return the claim time or None.

    A single conditional UPDATE (free, or claimed longer ago than the RealocAI read
    timeout plus a margin), so two requests can never both win. Unlike a row lock,
    no transaction stays open while RealocAI answers.
    """
    now = timezone.now()
    stale_before = now - timedelta(seconds=settings.REALOCAI_TIMEOUT_SECONDS + CLAIM_GRACE_SECONDS)
    claimed = (
        Conversation.objects.filter(pk=conversation.pk)
        .filter(Q(processing_started_at__isnull=True) | Q(processing_started_at__lt=stale_before))
        .update(processing_started_at=now)
    )
    return now if claimed else None


def _release(conversation, claimed_at):
    # Only our own claim: if it went stale and another request took over, keep theirs.
    Conversation.objects.filter(pk=conversation.pk, processing_started_at=claimed_at).update(
        processing_started_at=None
    )


def _ask_agent(conversation, content) -> ChatSuccess:
    """Call RealocAI; return the successful result or raise AgentUnavailableError.

    Nothing is written here: the new conversa_id is stored with the messages.
    """
    started = time.monotonic()
    external_id = conversation.external_conversation_id or None
    result = _send(conversation, external_id, content)

    if external_id is not None and _is_expired(result):
        logger.warning(
            "RealocAI conversation expired; restarting it (conversation=%s)", conversation.id
        )
        result = _send(conversation, None, content)

    if not isinstance(result, ChatSuccess):
        logger.error(
            "RealocAI request failed (conversation=%s, error=%s, status=%s, duration_ms=%d)",
            conversation.id,
            result.kind,
            result.status_code,
            (time.monotonic() - started) * 1000,
        )
        raise AgentUnavailableError()
    return result


def _send(conversation, external_id, content):
    if external_id is None:
        content = _with_context(conversation, content)
    return send_chat_message(external_id, content)


def _with_context(conversation, content):
    """Prefix the first message of a new RealocAI conversation with known context.

    EXPERIMENTAL, behind settings.REALOCAI_INJECT_MEMORIES (off by default). A new
    RealocAI conversation starts without history, so we pass the conversation summary
    (useful when an expired conversation is restarted) and the user's top memories.
    Only the outgoing text changes; the stored user message stays as typed.
    """
    if not settings.REALOCAI_INJECT_MEMORIES:
        return content

    parts = []
    summary = conversation.summary.strip().rstrip(".")
    if summary:
        parts.append(summary)
    memories = get_active_memories(conversation.user_id, limit=CONTEXT_MEMORY_LIMIT)
    if memories:
        parts.append("Preferências conhecidas: " + "; ".join(m.content for m in memories))
    if not parts:
        return content
    return f"[Contexto — não repita isto ao usuário: {'. '.join(parts)}]\n{content}"


def _is_expired(result):
    return isinstance(result, ChatFailure) and result.kind == ChatErrorKind.EXPIRED
