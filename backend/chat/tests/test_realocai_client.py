import json

import httpx
import pytest

from chat.services.realocai_client import (
    ChatErrorKind,
    ChatFailure,
    ChatSuccess,
    send_chat_message,
)

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL


def test_success_sends_key_and_body(respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(200, json={"conversa_id": "abc", "resposta": "Olá!"})
    )

    result = send_chat_message(None, "Quais horários livres amanhã?")

    assert result == ChatSuccess(conversa_id="abc", resposta="Olá!")
    request = route.calls.last.request
    assert request.headers["X-API-Key"] == REALOCAI_API_KEY
    assert json.loads(request.content) == {
        "conversa_id": None,
        "mensagem": "Quais horários livres amanhã?",
    }


def test_sends_existing_conversation_id(respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(200, json={"conversa_id": "abc", "resposta": "Ok"})
    )

    send_chat_message("abc", "Oi")

    assert json.loads(route.calls.last.request.content)["conversa_id"] == "abc"


def test_base_url_trailing_slash_is_ignored(respx_mock, settings):
    settings.REALOCAI_BASE_URL += "/"
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(200, json={"conversa_id": "abc", "resposta": "Ok"})
    )

    assert isinstance(send_chat_message(None, "Oi"), ChatSuccess)


@pytest.mark.parametrize(
    "status, kind",
    [
        (401, ChatErrorKind.CONFIG),
        (404, ChatErrorKind.EXPIRED),
        (422, ChatErrorKind.INVALID),
        (500, ChatErrorKind.UPSTREAM),
        (502, ChatErrorKind.UPSTREAM),
        (503, ChatErrorKind.UPSTREAM),
        (400, ChatErrorKind.UPSTREAM),
    ],
)
def test_error_status_mapping(respx_mock, status, kind):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(status, json={"detail": "erro"})
    )

    assert send_chat_message("abc", "Oi") == ChatFailure(kind, status)


@pytest.mark.parametrize(
    "exc",
    [httpx.ReadTimeout("timeout"), httpx.ConnectError("refused"), httpx.ConnectTimeout("t")],
)
def test_network_errors(respx_mock, exc):
    respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=exc)

    assert send_chat_message(None, "Oi") == ChatFailure(ChatErrorKind.NETWORK)


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="não é json"),
        httpx.Response(200, json=["lista"]),
        httpx.Response(200, json={"resposta": "sem id"}),
        httpx.Response(200, json={"conversa_id": "abc"}),
        httpx.Response(200, json={"conversa_id": "", "resposta": "Ok"}),
        httpx.Response(200, json={"conversa_id": "x" * 65, "resposta": "Ok"}),
        httpx.Response(200, json={"conversa_id": 123, "resposta": "Ok"}),
        httpx.Response(200, json={"conversa_id": "abc", "resposta": "  "}),
    ],
    ids=["not-json", "not-object", "no-id", "no-answer", "empty-id", "long-id", "int-id", "blank"],
)
def test_malformed_success_is_upstream_error(respx_mock, response):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=response)

    assert send_chat_message(None, "Oi") == ChatFailure(ChatErrorKind.UPSTREAM, 200)


@pytest.mark.parametrize("setting", ["REALOCAI_BASE_URL", "REALOCAI_API_KEY"])
def test_missing_configuration_does_not_call_upstream(respx_mock, settings, setting):
    setattr(settings, setting, "")
    route = respx_mock.post(REALOCAI_CHAT_URL)

    assert send_chat_message(None, "Oi") == ChatFailure(ChatErrorKind.CONFIG)
    assert not route.called
