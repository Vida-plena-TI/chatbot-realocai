"""Client for the RealocAI agent service (server-to-server only).

`send_chat_message` is the only interface the rest of the code uses. It talks HTTP to
RealocAI, or, with settings.REALOCAI_USE_FAKE, to the canned implementation in
chat.services.realocai_fake (local development and demos).

The API key is sent in the X-API-Key header and must never be logged, returned to
the frontend or included in error messages. Message contents and report blocks are
health data: this module never logs them either.
"""

from dataclasses import dataclass, field
from enum import StrEnum

import httpx
from django.conf import settings

CHAT_PATH = "/agenda/chat"
# Matches Conversation.external_conversation_id.
MAX_CONVERSATION_ID_LENGTH = 64
# Reading the answer uses settings.REALOCAI_TIMEOUT_SECONDS; connecting must be quick.
CONNECT_TIMEOUT_SECONDS = 5
MAX_BLOCOS = 10


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
    # Report blocks, opaque JSON. Only the envelope is checked (see validate_blocos).
    blocos: list = field(default_factory=list)
    # True when RealocAI sent blocks that failed validation and were dropped. The
    # turn still succeeds; the caller logs a warning.
    blocos_descartados: bool = False


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
    """Send one user message to RealocAI; `conversa_id=None` starts a new conversation.

    Never raises for HTTP or network errors: every outcome is returned as a result.
    """
    if settings.REALOCAI_USE_FAKE:
        from chat.services import realocai_fake

        return realocai_fake.send_chat_message(conversa_id, mensagem)
    return _send_http(conversa_id, mensagem)


def validate_blocos(raw) -> tuple[list, bool]:
    """Return (blocos, dropped). Missing blocks are an empty list.

    Blocks are kept as opaque JSON: only a list of at most MAX_BLOCOS objects, each
    with "tipo" and "versao", is accepted. Anything else is dropped as a whole, never
    reshaped, and `dropped` is True.
    """
    if raw is None:
        return [], False
    valid = (
        isinstance(raw, list)
        and len(raw) <= MAX_BLOCOS
        and all(isinstance(b, dict) and "tipo" in b and "versao" in b for b in raw)
    )
    return (raw, False) if valid else ([], True)


def _send_http(conversa_id, mensagem):
    base_url = settings.REALOCAI_BASE_URL
    api_key = settings.REALOCAI_API_KEY
    if not base_url or not api_key:
        return ChatFailure(ChatErrorKind.CONFIG)

    try:
        response = httpx.post(
            base_url.rstrip("/") + CHAT_PATH,
            headers={"X-API-Key": api_key},
            json={
                "conversa_id": conversa_id,
                "mensagem": mensagem,
                "renderiza_relatorios": True,
            },
            timeout=httpx.Timeout(
                settings.REALOCAI_TIMEOUT_SECONDS, connect=CONNECT_TIMEOUT_SECONDS
            ),
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
    if not isinstance(data, dict):
        return ChatFailure(ChatErrorKind.UPSTREAM, response.status_code)

    conversa_id = data.get("conversa_id")
    resposta = data.get("resposta")
    valid = (
        isinstance(conversa_id, str)
        and 0 < len(conversa_id) <= MAX_CONVERSATION_ID_LENGTH
        and isinstance(resposta, str)
        and resposta.strip()
    )
    if not valid:
        return ChatFailure(ChatErrorKind.UPSTREAM, response.status_code)

    blocos, dropped = validate_blocos(data.get("blocos"))
    return ChatSuccess(
        conversa_id=conversa_id, resposta=resposta, blocos=blocos, blocos_descartados=dropped
    )
