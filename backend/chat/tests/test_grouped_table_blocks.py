"""The optional `dados.agrupar_por` / `dados.unidade_grupo` fields of a `tabela_generica`
block (additive, contract versao 1) go from RealocAI to the frontend untouched: blocks
are opaque JSON, only the envelope is validated. Fictitious data only."""

import httpx
import pytest
from rest_framework.test import APIClient

from chat.models import Message
from core.tests.logs import all_log_text, capture_all_logs

from .conftest import REALOCAI_CHAT_URL
from .test_api import messages_url
from .test_realocai_client import load_fixture

pytestmark = pytest.mark.django_db

AGRUPADA = "tabela_generica_pacientes_por_profissional_nomes_agrupada"


def test_grouped_block_reaches_the_coordinator_unchanged(
    coordinator, conversation, respx_mock, caplog
):
    bloco = load_fixture(AGRUPADA)
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200, json={"conversa_id": "ext-1", "resposta": "Resposta fictícia.", "blocos": [bloco]}
        )
    )
    client = APIClient()
    client.force_login(coordinator)

    with capture_all_logs(caplog):
        response = client.post(
            messages_url(conversation), {"content": "Pacientes de cada profissional"}, format="json"
        )
        history = client.get(messages_url(conversation))

    assert response.status_code == 201
    assert response.json()["assistant_message"]["blocos"] == [bloco]
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.blocos == [bloco]
    assert history.json()["results"][1]["blocos"] == [bloco]
    assert "Paciente Fictício" not in all_log_text(caplog)
