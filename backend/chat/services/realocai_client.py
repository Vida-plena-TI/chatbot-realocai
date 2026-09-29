"""HTTP client for the RealocAI agent service (server-to-server only).

The API key is sent in the X-API-Key header and must never be logged, returned to
the frontend or included in error messages. Message contents are health data: this
module never logs them either.
"""

from dataclasses import dataclass
from enum import StrEnum

import httpx
from django.conf import settings

CHAT_PATH = "/agenda/chat"
# Matches Conversation.external_conversation_id.
MAX_CONVERSATION_ID_LENGTH = 64


class ChatErrorKind(StrEnum):
    EXPIRED = "expired"  # 404: unknown or expired conversa_id; start a new one
    INVALID = "invalid"  # 422: request body rejected
    UPSTREAM = "upstream_error"  # 5xx, unexpected status or malformed response
    NETWORK = "network_error"  # timeout or connection failure
    CONFIG = "config_error"  # 401 or missing settings: our configuration is wrong


@dataclass(frozen=True)
class ChatSuccess:
    conversa_id: str
    resposta: str


@dataclass(frozen=True)
class ChatFailure:
    kind: ChatErrorKind
    status_code: int | None = None


ChatResult = ChatSuccess | ChatFailure

_STATUS_TO_KIND = {
    401: ChatErrorKind.CONFIG,
    404: ChatErrorKind.EXPIRED,
    422: ChatErrorKind.INVALID,
}


def send_chat_message(conversa_id: str | None, mensagem: str) -> ChatResult:
    """POST one user message to RealocAI; `conversa_id=None` starts a new conversation.

    Never raises for HTTP or network errors: every outcome is returned as a result.
    """
    base_url = settings.REALOCAI_BASE_URL
    api_key = settings.REALOCAI_API_KEY
    if not base_url or not api_key:
        return ChatFailure(ChatErrorKind.CONFIG)

    try:
        response = httpx.post(
            base_url.rstrip("/") + CHAT_PATH,
            headers={"X-API-Key": api_key},
            json={"conversa_id": conversa_id, "mensagem": mensagem},
            timeout=settings.REALOCAI_TIMEOUT_SECONDS,
        )
    except httpx.HTTPError:
        # Covers timeouts, connection errors and invalid URLs. The exception text is
        # deliberately dropped: callers only need the category.
        return ChatFailure(ChatErrorKind.NETWORK)

    if response.status_code != 200:
        kind = _STATUS_TO_KIND.get(response.status_code, ChatErrorKind.UPSTREAM)
        return ChatFailure(kind, response.status_code)

    return _parse_success(response)


def _parse_success(response: httpx.Response) -> ChatResult:
    try:
        data = response.json()
    except ValueError:
        return ChatFailure(ChatErrorKind.UPSTREAM, response.status_code)

    conversa_id = data.get("conversa_id") if isinstance(data, dict) else None
    resposta = data.get("resposta") if isinstance(data, dict) else None
    valid = (
        isinstance(conversa_id, str)
        and 0 < len(conversa_id) <= MAX_CONVERSATION_ID_LENGTH
        and isinstance(resposta, str)
        and resposta.strip()
    )
    if not valid:
        return ChatFailure(ChatErrorKind.UPSTREAM, response.status_code)
    return ChatSuccess(conversa_id=conversa_id, resposta=resposta)
