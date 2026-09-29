"""Orchestrates a chat turn between our conversation store and the RealocAI agent.

RealocAI keeps its own short-term memory per `conversa_id`; we store that id on
the Conversation and send only the new user message on each turn.

Logging rule: message contents and agent answers are health data and the API key is
a secret, so failures are logged with the conversation id and error kind only.
"""

import logging
from dataclasses import dataclass

from django.db import transaction

from chat.models import Conversation, Message
from chat.services.conversations import append_message
from chat.services.realocai_client import (
    ChatErrorKind,
    ChatFailure,
    ChatSuccess,
    send_chat_message,
)

logger = logging.getLogger(__name__)

AGENT_UNAVAILABLE_MESSAGE = "Não foi possível processar sua mensagem. Tente novamente."


class AgentUnavailableError(Exception):
    """RealocAI could not answer. The message is generic and safe to show to users."""

    def __init__(self, message=AGENT_UNAVAILABLE_MESSAGE):
        super().__init__(message)


@dataclass(frozen=True)
class Exchange:
    user_message: Message
    assistant_message: Message


def send_user_message(conversation, content) -> Message:
    """Send `content` to the agent and return the stored assistant message."""
    return exchange_messages(conversation, content).assistant_message


def exchange_messages(conversation, content) -> Exchange:
    """Store the user message, ask RealocAI and store its answer.

    The user message is saved first, so it is kept even when the agent fails. On
    failure no assistant message is created and AgentUnavailableError is raised.
    A 404 (expired RealocAI conversation) is retried once as a new conversation.
    """
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Message content must not be blank.")

    user_message = append_message(conversation, Message.Role.USER, content)

    # The conversation row stays locked while RealocAI answers, so concurrent turns of
    # the same conversation are serialized: a second request waits here and then sees
    # the conversa_id stored by the first one, instead of opening another conversation.
    with transaction.atomic():
        locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
        result = _ask_agent(locked, content)
        conversation.external_conversation_id = locked.external_conversation_id

    if not isinstance(result, ChatSuccess):
        logger.error(
            "RealocAI request failed (conversation=%s, error=%s, status=%s)",
            conversation.id,
            result.kind,
            result.status_code,
        )
        raise AgentUnavailableError()

    assistant_message = append_message(conversation, Message.Role.ASSISTANT, result.resposta)
    return Exchange(user_message, assistant_message)


def _ask_agent(locked, content):
    """Call RealocAI for a locked conversation and persist the resulting conversa_id."""
    external_id = locked.external_conversation_id or None
    result = send_chat_message(external_id, content)

    if external_id is not None and _is_expired(result):
        logger.warning("RealocAI conversation expired; restarting it (conversation=%s)", locked.id)
        _set_external_id(locked, "")
        result = send_chat_message(None, content)

    if isinstance(result, ChatSuccess) and result.conversa_id != locked.external_conversation_id:
        _set_external_id(locked, result.conversa_id)
    return result


def _set_external_id(conversation, value):
    conversation.external_conversation_id = value
    conversation.save(update_fields=["external_conversation_id"])


def _is_expired(result):
    return isinstance(result, ChatFailure) and result.kind == ChatErrorKind.EXPIRED
