"""LGPD: a chat turn never logs the message, the answer or report blocks, and RealocAI's
error bodies (a 422 echoes the request in `input`) never reach the client or the logs."""

import httpx
import pytest
from rest_framework.test import APIClient

from chat.services.agent import AGENT_UNAVAILABLE_MESSAGE
from core.tests.logs import all_log_text, capture_all_logs, strings_in
from reports.tests.test_export_contract import load_example

from .conftest import REALOCAI_API_KEY, REALOCAI_CHAT_URL
from .test_api import messages_url

pytestmark = pytest.mark.django_db

PATIENT = "Paciente Ficticio Alfa"
QUESTION = f"Monte a agenda da semana de {PATIENT}."
ANSWER = f"Esta é a agenda de {PATIENT} na semana."


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client


def validation_error_body():
    """FastAPI's 422 body: echoes the received request under `input`."""
    request = {"conversa_id": None, "mensagem": QUESTION, "renderiza_relatorios": True}
    return {
        "detail": [
            {"type": "missing", "loc": ["body", "input"], "msg": "Field required", "input": request}
        ]
    }


def post_message(client, conversation, content=QUESTION):
    return client.post(messages_url(conversation), {"content": content}, format="json")


def assert_nothing_leaked(caplog, *values):
    logged = all_log_text(caplog)
    for value in (PATIENT, QUESTION, ANSWER, REALOCAI_API_KEY, *values):
        assert value not in logged


def test_agent_422_returns_a_generic_error_and_never_echoes_input(
    api, conversation, respx_mock, caplog
):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(422, json=validation_error_body())
    )

    with capture_all_logs(caplog):
        response = post_message(api, conversation)

    assert response.status_code == 502
    assert response.json() == {"detail": AGENT_UNAVAILABLE_MESSAGE}
    body = response.content.decode()
    assert PATIENT not in body
    assert "input" not in body
    assert conversation.messages.count() == 0
    errors = [r for r in caplog.records if r.name == "chat.services.agent"]
    assert len(errors) == 1
    assert "error=invalid" in errors[0].getMessage()
    assert "status=422" in errors[0].getMessage()
    assert_nothing_leaked(caplog, "Field required", '"input"', "'input'")


@pytest.mark.parametrize("status", [400, 422, 500, 502])
def test_agent_error_bodies_never_reach_the_logs(api, conversation, respx_mock, caplog, status):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(status, json=validation_error_body())
    )

    with capture_all_logs(caplog):
        response = post_message(api, conversation)

    assert response.status_code == 502
    assert PATIENT not in response.content.decode()
    assert any(r.name == "chat.services.agent" for r in caplog.records)
    assert_nothing_leaked(caplog, "Field required")


def test_successful_turn_with_patient_blocks_logs_no_content(
    api, conversation, respx_mock, fake_openai, caplog
):
    blocos = [load_example("agenda_paciente"), load_example("disponibilidade_vagas")]
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200, json={"conversa_id": "ext-1", "resposta": ANSWER, "blocos": blocos}
        )
    )
    fake_openai.output = {
        "memories": [{"kind": "preference", "content": "Prefere tabelas.", "importance": 3}],
        "summary": "Conversa sobre a agenda da semana.",
    }

    with capture_all_logs(caplog):
        response = post_message(api, conversation)

    assert response.status_code == 201
    assert response.json()["assistant_message"]["blocos"] == blocos
    assert fake_openai.calls
    # Real names and titles; short values ("Sala 1") could match log text by chance.
    values = [v for v in strings_in(blocos) if len(v) >= 8]
    assert len(values) > 10
    assert_nothing_leaked(caplog, *values, "Prefere tabelas.", "Conversa sobre a agenda")
