"""Report blocks with patient data only reach superusers and the "coordenacao" group:
dropped before storing (chat turn), hidden on read (history) and refused on export."""

import importlib
import json

import httpx
import pytest
from django.apps import apps
from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework.test import APIClient

from chat.models import Message
from chat.services.conversations import record_exchange
from chat.services.sensitive import (
    PATIENT_REPORTS_GROUP,
    PATIENT_REPORTS_RESTRICTED_MESSAGE,
    can_view_patient_reports,
    is_sensitive_block,
    split_sensitive_blocks,
)
from core.tests.logs import all_log_text, capture_all_logs, strings_in
from reports.tests.test_export_contract import load_example
from reports.views import PATIENT_REPORTS_FORBIDDEN

from .conftest import REALOCAI_CHAT_URL
from .test_api import messages_url

pytestmark = pytest.mark.django_db

ANSWER = "Resposta fictícia do agente sobre o relatório pedido."
EXPORT_URL = reverse("reports:export")


def pacientes_por_plano():
    """Fictitious block in the shape of RealocAI's `pacientes_por_plano` (PR #13)."""
    colunas = [
        {"chave": "plano", "rotulo": "Plano", "formato": "texto"},
        {"chave": "paciente", "rotulo": "Paciente", "formato": "texto"},
        {"chave": "atendimentos_semana", "rotulo": "Atendimentos na semana", "formato": "inteiro"},
    ]
    linhas = [
        {"plano": "Klini", "paciente": "Paciente Ficticio Bravo", "atendimentos_semana": 2},
        {"plano": "Unimed", "paciente": "Paciente Ficticio Charlie", "atendimentos_semana": 1},
    ]
    return {
        "versao": 1,
        "tipo": "tabela_generica",
        "titulo": "Pacientes por plano de saúde (grade semanal vigente)",
        "periodo": None,
        "meta": None,
        "parcial": False,
        "dias_nao_lidos": [],
        "avisos": [],
        "resumo": [],
        "dados": {
            "tipo": "tabela_generica",
            "relatorio": "pacientes_por_plano",
            "dimensoes": [],
            "metricas": [],
            "colunas": colunas,
            "linhas": linhas,
            "total": {},
            "linhas_omitidas": 0,
        },
        "tabelas": [{"nome": "Pacientes", "colunas": colunas, "linhas": linhas}],
    }


SENSITIVE_EXAMPLES = {
    "agenda_paciente": lambda: load_example("agenda_paciente"),
    "pacientes_por_plano": pacientes_por_plano,
}


def sensitive_values(bloco):
    # Names and titles; short values ("Sala 1") could match unrelated text by chance,
    # and words of the fixed message ("paciente") are expected in the stored answer.
    return [
        v
        for v in strings_in(bloco)
        if len(v) >= 8 and v.lower() not in PATIENT_REPORTS_RESTRICTED_MESSAGE.lower()
    ]


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client


@pytest.fixture
def superuser(user):
    user.is_superuser = True
    user.save(update_fields=["is_superuser"])
    return user


def mock_agent(respx_mock, blocos, resposta=ANSWER):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200, json={"conversa_id": "ext-1", "resposta": resposta, "blocos": blocos}
        )
    )


def post_message(client, conversation, content="Relatório fictício, por favor."):
    return client.post(messages_url(conversation), {"content": content}, format="json")


def stored_text(conversation):
    """Everything stored for the conversation, as one string."""
    conversation.refresh_from_db()
    rows = Message.objects.filter(conversation=conversation).values("content", "blocos")
    return json.dumps(
        [list(rows), conversation.title, conversation.preview, conversation.summary],
        ensure_ascii=False,
    )


# --- rules -------------------------------------------------------------------------


@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_patient_blocks_are_sensitive(name):
    assert is_sensitive_block(SENSITIVE_EXAMPLES[name]())


@pytest.mark.parametrize(
    "bloco",
    [
        load_example("disponibilidade_vagas"),
        load_example("tabela_generica_plano_semanal"),
        {"tipo": "tabela_generica", "dados": {"relatorio": "outro"}},
    ],
)
def test_other_blocks_are_not_sensitive(bloco):
    assert not is_sensitive_block(bloco)


@pytest.mark.parametrize(
    "bloco",
    [
        None,
        "agenda_paciente",
        42,
        [],
        {},
        {"versao": 1},
        {"tipo": None},
        {"tipo": ["agenda_paciente"]},
        {"tipo": "tabela_generica"},
        {"tipo": "tabela_generica", "dados": "pacientes_por_plano"},
        {"tipo": "tabela_generica", "dados": {"relatorio": ["pacientes_por_plano"]}},
        {"tipo": "tabela_generica", "dados": None},
    ],
)
def test_malformed_blocks_are_not_sensitive_and_never_raise(bloco):
    assert is_sensitive_block(bloco) is False


def test_split_keeps_order_and_counts_the_dropped():
    comum = load_example("disponibilidade_vagas")
    blocos = [pacientes_por_plano(), comum, load_example("agenda_paciente")]

    assert split_sensitive_blocks(blocos) == ([comum], 2)
    assert split_sensitive_blocks(None) == ([], 0)


def test_who_can_view_patient_reports(user, django_user_model):
    from django.contrib.auth.models import AnonymousUser

    assert not can_view_patient_reports(AnonymousUser())
    assert not can_view_patient_reports(None)
    assert not can_view_patient_reports(user)

    user.groups.add(Group.objects.get_or_create(name=PATIENT_REPORTS_GROUP)[0])
    assert can_view_patient_reports(user)

    admin = django_user_model.objects.create_superuser(
        email="admin@exemplo.com", password="senha-forte-123"
    )
    assert can_view_patient_reports(admin)
    admin.is_active = False
    assert not can_view_patient_reports(admin)


def test_migration_creates_the_group_idempotently():
    migration = importlib.import_module("chat.migrations.0005_patient_reports_group")

    migration.create_group(apps, None)
    migration.create_group(apps, None)

    group = Group.objects.get(name=PATIENT_REPORTS_GROUP)
    assert Group.objects.filter(name=PATIENT_REPORTS_GROUP).count() == 1
    assert not group.user_set.exists()


# --- chat turn ---------------------------------------------------------------------


@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_user_without_group_gets_the_fixed_text_and_nothing_is_stored(
    api, conversation, respx_mock, name
):
    bloco = SENSITIVE_EXAMPLES[name]()
    mock_agent(respx_mock, [bloco])

    response = post_message(api, conversation)

    assert response.status_code == 201
    answer = response.json()["assistant_message"]
    assert answer["content"] == PATIENT_REPORTS_RESTRICTED_MESSAGE
    assert "blocos" not in answer
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.content == PATIENT_REPORTS_RESTRICTED_MESSAGE
    assert stored.blocos == []
    text = stored_text(conversation)
    assert ANSWER not in text
    for value in sensitive_values(bloco):
        assert value not in text


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_group_members_and_superusers_get_the_block(
    request, api, conversation, respx_mock, member, name
):
    request.getfixturevalue(member)
    bloco = SENSITIVE_EXAMPLES[name]()
    mock_agent(respx_mock, [bloco])

    response = post_message(api, conversation)

    assert response.status_code == 201
    answer = response.json()["assistant_message"]
    assert answer["content"] == ANSWER
    assert answer["blocos"] == [bloco]
    assert Message.objects.get(conversation=conversation, role="assistant").blocos == [bloco]


def test_mixed_answer_only_drops_the_sensitive_block(api, conversation, respx_mock):
    comum = load_example("disponibilidade_vagas")
    sensivel = load_example("agenda_paciente")
    mock_agent(respx_mock, [sensivel, comum])

    response = post_message(api, conversation)

    answer = response.json()["assistant_message"]
    assert answer["content"] == PATIENT_REPORTS_RESTRICTED_MESSAGE
    assert answer["blocos"] == [comum]
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.blocos == [comum]
    for value in sensitive_values(sensivel):
        if value not in sensitive_values(comum):
            assert value not in stored_text(conversation)


def test_answer_without_sensitive_blocks_is_unchanged(api, conversation, respx_mock):
    comum = load_example("disponibilidade_vagas")
    mock_agent(respx_mock, [comum])

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == ANSWER
    assert answer["blocos"] == [comum]


def test_dropping_logs_only_the_count(api, conversation, respx_mock, caplog):
    blocos = [load_example("agenda_paciente"), pacientes_por_plano()]
    mock_agent(respx_mock, blocos)

    with capture_all_logs(caplog):
        assert post_message(api, conversation).status_code == 201

    dropped = [r for r in caplog.records if "sensitive_blocks_dropped" in r.getMessage()]
    assert [r.getMessage().split(" ")[0] for r in dropped] == ["sensitive_blocks_dropped=2"]
    logged = all_log_text(caplog)
    for value in (
        ANSWER,
        "agenda_paciente",
        "pacientes_por_plano",
        *(b["titulo"] for b in blocos),
        *(v for b in blocos for v in sensitive_values(b)),
    ):
        assert value not in logged


# --- history -----------------------------------------------------------------------


@pytest.fixture
def old_answer(conversation):
    """Stored before the restriction existed: a sensitive block next to a common one."""
    blocos = [load_example("agenda_paciente"), load_example("disponibilidade_vagas")]
    record_exchange(conversation, "Pergunta fictícia", ANSWER, blocos=blocos)
    return blocos


def history_blocos(client, conversation):
    response = client.get(messages_url(conversation))
    assert response.status_code == 200
    return response.json()["results"][1].get("blocos")


def test_history_hides_old_sensitive_blocks_without_changing_the_stored_ones(
    api, conversation, old_answer
):
    assert history_blocos(api, conversation) == [old_answer[1]]
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.blocos == old_answer


def test_history_without_any_visible_block_has_no_blocos_key(api, conversation):
    record_exchange(conversation, "Pergunta", ANSWER, blocos=[pacientes_por_plano()])

    assert history_blocos(api, conversation) is None


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
def test_history_shows_sensitive_blocks_to_members(request, api, conversation, old_answer, member):
    request.getfixturevalue(member)

    assert history_blocos(api, conversation) == old_answer


def test_history_hides_them_again_after_leaving_the_group(
    api, coordinator, conversation, old_answer
):
    assert history_blocos(api, conversation) == old_answer
    coordinator.groups.clear()

    assert history_blocos(api, conversation) == [old_answer[1]]


# --- export ------------------------------------------------------------------------


def export(client, blocos):
    return client.post(EXPORT_URL, {"formato": "excel", "blocos": blocos}, format="json")


@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_export_of_sensitive_block_is_forbidden_without_group(api, caplog, name):
    bloco = SENSITIVE_EXAMPLES[name]()

    with capture_all_logs(caplog):
        response = export(api, [load_example("disponibilidade_vagas"), bloco])

    assert response.status_code == 403
    assert response.json() == {"detail": PATIENT_REPORTS_FORBIDDEN}
    body = response.content.decode()
    logged = all_log_text(caplog)
    for value in sensitive_values(bloco):
        assert value not in body
        assert value not in logged


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_export_of_sensitive_block_works_for_members(request, api, member, name):
    request.getfixturevalue(member)

    response = export(api, [SENSITIVE_EXAMPLES[name]()])

    assert response.status_code == 200
    assert response["Content-Disposition"].startswith("attachment;")


def test_export_of_common_blocks_still_works_without_group(api):
    assert export(api, [load_example("disponibilidade_vagas")]).status_code == 200
