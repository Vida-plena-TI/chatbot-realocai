"""Orchestrates a chat turn between our conversation store and the RealocAI agent.

RealocAI keeps its own short-term memory per `conversa_id`; we store that id on
the Conversation and send only the new user message on each turn.

Logging rule: message contents and agent answers are health data and the API key is
a secret, so failures are logged with the conversation id and error kind only.
"""

import logging
from dataclasses import dataclass

from chat.models import Message
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

    external_id = conversation.external_conversation_id or None
    result = send_chat_message(external_id, content)

    if external_id is not None and _is_expired(result):
        logger.warning(
            "RealocAI conversation expired; restarting it (conversation=%s)", conversation.id
        )
        _set_external_id(conversation, "")
        result = send_chat_message(None, content)

    if not isinstance(result, ChatSuccess):
        logger.error(
            "RealocAI request failed (conversation=%s, error=%s, status=%s)",
            conversation.id,
            result.kind,
            result.status_code,
        )
        raise AgentUnavailableError()

    if result.conversa_id != conversation.external_conversation_id:
        _set_external_id(conversation, result.conversa_id)

    assistant_message = append_message(conversation, Message.Role.ASSISTANT, result.resposta)
    return Exchange(user_message, assistant_message)


def _set_external_id(conversation, value):
    conversation.external_conversation_id = value
    conversation.save(update_fields=["external_conversation_id"])


def _is_expired(result):
    return isinstance(result, ChatFailure) and result.kind == ChatErrorKind.EXPIRED
