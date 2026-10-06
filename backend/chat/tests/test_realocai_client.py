import json
import logging
from pathlib import Path

import httpx
import pytest

from chat.services import realocai_fake
from chat.services.realocai_client import (
    CONNECT_TIMEOUT_SECONDS,
    ChatErrorKind,
    ChatFailure,
    ChatSuccess,
    send_chat_message,
)

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name):
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


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
        "renderiza_relatorios": True,
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


def test_timeouts_connect_5s_and_read_from_settings(respx_mock, settings):
    settings.REALOCAI_TIMEOUT_SECONDS = 90
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(200, json={"conversa_id": "abc", "resposta": "Ok"})
    )

    send_chat_message(None, "Oi")

    timeout = route.calls.last.request.extensions["timeout"]
    assert timeout["connect"] == CONNECT_TIMEOUT_SECONDS == 5
    assert timeout["read"] == 90


def test_network_error_is_not_retried(respx_mock):
    route = respx_mock.post(REALOCAI_CHAT_URL).mock(side_effect=httpx.ReadTimeout("timeout"))

    send_chat_message("abc", "Oi")

    assert route.call_count == 1


# --- Report blocks ----------------------------------------------------------------------


def answer_with(**extra):
    return httpx.Response(200, json={"conversa_id": "abc", "resposta": "Segue.", **extra})


@pytest.mark.parametrize(
    "extra", [{}, {"blocos": None}, {"blocos": []}], ids=["absent", "null", "empty"]
)
def test_missing_blocks_are_an_empty_list(respx_mock, extra):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=answer_with(**extra))

    assert send_chat_message("abc", "Oi") == ChatSuccess("abc", "Segue.", [], False)


@pytest.mark.parametrize(
    "name", ["ocupacao_profissional", "pacientes_por_profissional_semana", "ocupacao_agregada"]
)
def test_real_blocks_are_kept_untouched(respx_mock, name):
    bloco = load_fixture(name)
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=answer_with(blocos=[bloco]))

    result = send_chat_message("abc", "Oi")

    assert result.blocos == [bloco]
    assert result.blocos_descartados is False


def test_ten_blocks_are_accepted(respx_mock):
    blocos = [load_fixture("ocupacao_agregada")] * 10
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=answer_with(blocos=blocos))

    assert len(send_chat_message("abc", "Oi").blocos) == 10


@pytest.mark.parametrize(
    "blocos",
    [
        {"tipo": "x", "versao": 1},
        [{"tipo": "x", "versao": 1}] * 11,
        [{"tipo": "x"}],
        [{"versao": 1}],
        ["texto"],
        [{"tipo": "x", "versao": 1}, None],
        "blocos",
    ],
    ids=["object", "eleven", "no-versao", "no-tipo", "string-item", "null-item", "string"],
)
def test_invalid_blocks_are_dropped_but_the_answer_is_kept(respx_mock, caplog, blocos):
    respx_mock.post(REALOCAI_CHAT_URL).mock(return_value=answer_with(blocos=blocos))

    with caplog.at_level(logging.DEBUG):
        result = send_chat_message("abc", "Oi")

    assert result == ChatSuccess("abc", "Segue.", [], True)
    # The client never logs; the caller (agent) does, without contents.
    assert caplog.records == []


# --- Fake client (REALOCAI_USE_FAKE) ------------------------------------------------------


@pytest.fixture
def use_fake(settings):
    settings.REALOCAI_USE_FAKE = True
    # Neither URL nor key are needed.
    settings.REALOCAI_BASE_URL = ""
    settings.REALOCAI_API_KEY = ""


def test_fake_never_calls_the_network(respx_mock, use_fake):
    route = respx_mock.post(REALOCAI_CHAT_URL)

    result = send_chat_message(None, "Bom dia")

    assert isinstance(result, ChatSuccess)
    assert result.conversa_id.startswith("fake-")
    assert result.blocos == []
    assert not route.called


def test_fake_keeps_the_conversation_id(use_fake):
    assert send_chat_message("fake-abc", "Bom dia").conversa_id == "fake-abc"


@pytest.mark.parametrize(
    "mensagem, tipos",
    [
        ("Ocupação da semana", ["ocupacao_profissional"]),
        ("ocupação por especialidade", ["ocupacao_agregada"]),
        ("Quantos pacientes por profissional?", ["pacientes_por_profissional"]),
        (
            "Relatório completo",
            ["ocupacao_profissional", "pacientes_por_profissional", "ocupacao_agregada"],
        ),
    ],
)
def test_fake_returns_sample_blocks(use_fake, mensagem, tipos):
    result = send_chat_message(None, mensagem)

    assert [b["tipo"] for b in result.blocos] == tipos
    assert result.blocos_descartados is False


def test_fake_samples_match_the_real_examples(use_fake):
    for name in ("ocupacao_profissional", "ocupacao_agregada", "pacientes_por_profissional_semana"):
        assert realocai_fake._sample(name) == load_fixture(name)


def test_fake_can_propose_a_reallocation(use_fake):
    result = send_chat_message(None, "Preciso realocar a Paciente A")

    assert "```proposta" in result.resposta
