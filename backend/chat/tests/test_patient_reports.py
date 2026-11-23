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
    PATIENT_DATA_FLAG,
    PATIENT_REPORTS_GROUP,
    PATIENT_REPORTS_RESTRICTED_MESSAGE,
    SENSITIVE_BLOCK_RULES,
    can_view_patient_reports,
    is_sensitive_block,
    split_sensitive_blocks,
)
from core.tests.logs import all_log_text, capture_all_logs, strings_in
from reports.tests.test_export_contract import load_example
from reports.views import PATIENT_REPORTS_FORBIDDEN

from .conftest import REALOCAI_CHAT_URL
from .test_api import messages_url
from .test_realocai_client import load_fixture

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


def pacientes_por_profissional_nomes():
    """Fictitious block in the shape of RealocAI's `pacientes_por_profissional_nomes`
    (agent PR #14): patient names per professional, `periodo` null."""
    colunas = [
        {"chave": "especialidade", "rotulo": "Especialidade", "formato": "texto"},
        {"chave": "profissional", "rotulo": "Profissional", "formato": "texto"},
        {"chave": "paciente", "rotulo": "Paciente", "formato": "texto"},
        {"chave": "dias", "rotulo": "Dias", "formato": "texto"},
        {"chave": "atendimentos_semana", "rotulo": "Atendimentos na semana", "formato": "inteiro"},
    ]
    linhas = [
        {
            "especialidade": "Fonoaudiologia",
            "profissional": "Profissional Ficticia Delta",
            "paciente": "Paciente Ficticio Esmeralda",
            "dias": "Seg, Qua",
            "atendimentos_semana": 2,
        },
        {
            "especialidade": "Psicologia",
            "profissional": "Profissional Ficticia Gama",
            "paciente": "Paciente Ficticio Esmeralda",
            "dias": "Ter",
            "atendimentos_semana": 1,
        },
    ]
    resumo_colunas = [
        {"chave": "especialidade", "rotulo": "Especialidade", "formato": "texto"},
        {"chave": "profissional", "rotulo": "Profissional", "formato": "texto"},
        {"chave": "pacientes", "rotulo": "Pacientes", "formato": "inteiro"},
        {"chave": "atendimentos_semana", "rotulo": "Atendimentos na semana", "formato": "inteiro"},
    ]
    resumo_linhas = [
        {
            "especialidade": "Fonoaudiologia",
            "profissional": "Profissional Ficticia Delta",
            "pacientes": 1,
            "atendimentos_semana": 2,
        },
        {
            "especialidade": "Psicologia",
            "profissional": "Profissional Ficticia Gama",
            "pacientes": 1,
            "atendimentos_semana": 1,
        },
    ]
    return {
        "versao": 1,
        "tipo": "tabela_generica",
        "titulo": "Pacientes por profissional (grade semanal vigente)",
        "periodo": None,
        "meta": None,
        "parcial": False,
        "dias_nao_lidos": [],
        "avisos": ["Paciente atendido por mais de uma profissional aparece na lista de cada uma."],
        "resumo": [{"rotulo": "Pacientes distintos", "valor": 1, "formato": "inteiro"}],
        "dados": {
            "tipo": "tabela_generica",
            "relatorio": "pacientes_por_profissional_nomes",
            "dimensoes": [],
            "metricas": [],
            "colunas": colunas,
            "linhas": linhas,
            "total": {},
            "linhas_omitidas": 0,
        },
        "tabelas": [
            {"nome": "Pacientes", "colunas": colunas, "linhas": linhas},
            {"nome": "Resumo por profissional", "colunas": resumo_colunas, "linhas": resumo_linhas},
        ],
    }


def with_relatorio(bloco, relatorio):
    bloco["dados"]["relatorio"] = relatorio
    return bloco


def plano_realocacao_without_flag(relatorio="plano_realocacao"):
    """The official plano_realocacao example (agent PR #16, fictitious names) without the
    block-level flag, so only SENSITIVE_BLOCK_RULES can make it sensitive."""
    bloco = load_example("tabela_generica_plano_realocacao")
    del bloco[PATIENT_DATA_FLAG]
    return with_relatorio(bloco, relatorio)


# Near misses of "plano_realocacao": equality is exact, never prefix, substring or case-folded.
PLANO_REALOCACAO_NEAR_MISSES = (
    "plano_realocacao_x",
    "plano_realocacao ",
    " plano_realocacao",
    "plano_realocaca",
    "x_plano_realocacao",
    "Plano_realocacao",
    "PLANO_REALOCACAO",
    "plano-realocacao",
)


PANORAMA = "tabela_generica_panorama_enxugamento"
PANORAMA_COMPARATIVO = "tabela_generica_panorama_enxugamento_comparativo"


def panorama_without_flag(relatorio="panorama_enxugamento"):
    """The official panorama_enxugamento example (agent PR #18, fictitious patient and
    professional names) without the block-level flag: only SENSITIVE_BLOCK_RULES applies."""
    bloco = load_example(PANORAMA)
    del bloco[PATIENT_DATA_FLAG]
    return with_relatorio(bloco, relatorio)


def panorama_with_similar_relatorio(relatorio="panorama_enxugamento_x"):
    """The official panorama example, flag kept, with a `relatorio` no rule knows: only the
    flag can make it sensitive."""
    return with_relatorio(load_example(PANORAMA), relatorio)


# Near misses of "panorama_enxugamento": equality is exact, never prefix, substring or case-folded.
PANORAMA_NEAR_MISSES = (
    "panorama_enxugamento_x",
    "panorama_enxugamento ",
    " panorama_enxugamento",
    " panorama_enxugamento ",
    "panorama enxugamento",
    "panorama_enxugament",
    "x_panorama_enxugamento",
    "Panorama_enxugamento",
    "PANORAMA_ENXUGAMENTO",
    "panorama-enxugamento",
)

# What the agent writes next to the panorama: only counts and scenario codes, but they still
# reveal how many paid shifts could be freed (sensitive HR data), so none of it may be stored.
PANORAMA_ANSWER = (
    "Encontrei 3 cenários; o recomendado (E-5EB1, equilibrado) libera 3 turnos com presença paga."
)


def flagged_unknown_report():
    """A block no rule knows (future `relatorio`), flagged by the agent as sensitive."""
    return with_relatorio(pacientes_por_profissional_nomes(), "relatorio_futuro") | {
        PATIENT_DATA_FLAG: True
    }


# The agent's official examples (fictitious data, synced by frontend/scripts/sync-contrato.mjs):
# each one matches SENSITIVE_BLOCK_RULES AND carries `contem_dados_pacientes: true` at block level.
OFFICIAL_SENSITIVE_EXAMPLES = {
    "agenda_paciente": "agenda_paciente",
    "pacientes_por_plano": "tabela_generica_pacientes_por_plano",
    "pacientes_por_profissional_nomes": "tabela_generica_pacientes_por_profissional_nomes",
    # agent PR #16: the grouped plan and the ambiguous-name question share the same relatorio.
    "plano_realocacao": "tabela_generica_plano_realocacao",
    "plano_realocacao:pergunta": "tabela_generica_plano_realocacao_pergunta",
    # agent PR #20: two blocks with the same relatorio. The steps have patient AND professional
    # names (sensitive HR data); the comparison only has numbers, but the same relatorio.
    "panorama_enxugamento": PANORAMA,
    "panorama_enxugamento:comparativo": PANORAMA_COMPARATIVO,
}

SENSITIVE_EXAMPLES = {
    "pacientes_por_plano": pacientes_por_plano,
    "pacientes_por_profissional_nomes": pacientes_por_profissional_nomes,
    "contem_dados_pacientes": flagged_unknown_report,
    "panorama_enxugamento sem flag": panorama_without_flag,
    "panorama_enxugamento só pela flag": panorama_with_similar_relatorio,
    **{
        f"oficial:{kind}": (lambda name=name: load_example(name))
        for kind, name in OFFICIAL_SENSITIVE_EXAMPLES.items()
    },
}

# Must keep reaching every logged-in user: counts only, or no patient data at all.
NOT_SENSITIVE_EXAMPLES = {
    "pacientes_por_profissional": lambda: load_fixture("pacientes_por_profissional_semana"),
    "tabela_generica_plano_semanal": lambda: load_example("tabela_generica_plano_semanal"),
    "tabela_generica_ranking": lambda: load_example("tabela_generica_ranking"),
    "tabela_generica_capacidade": lambda: load_example("tabela_generica_capacidade"),
    # Near misses of the new value: equality is exact, never prefix or substring.
    **{
        f"relatorio={value!r}": (
            lambda value=value: with_relatorio(pacientes_por_profissional_nomes(), value)
        )
        for value in (
            "pacientes_por_profissional",
            "pacientes_por_profissional_nomes_x",
            "pacientes_por_profissional_nome",
            "x_pacientes_por_profissional_nomes",
            "Pacientes_por_profissional_nomes",
            " pacientes_por_profissional_nomes",
            "pacientes_por_profissional_nomes ",
        )
    },
    **{
        f"plano_realocacao sem flag, relatorio={value!r}": (
            lambda value=value: plano_realocacao_without_flag(value)
        )
        for value in PLANO_REALOCACAO_NEAR_MISSES
    },
    **{
        f"panorama_enxugamento sem flag, relatorio={value!r}": (
            lambda value=value: panorama_without_flag(value)
        )
        for value in PANORAMA_NEAR_MISSES
    },
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


@pytest.mark.parametrize("name", NOT_SENSITIVE_EXAMPLES)
def test_counts_and_near_misses_are_not_sensitive(name):
    assert is_sensitive_block(NOT_SENSITIVE_EXAMPLES[name]()) is False


@pytest.mark.parametrize(
    "bloco",
    [
        {"tipo": "tipo_futuro", PATIENT_DATA_FLAG: True},
        {PATIENT_DATA_FLAG: True},
        load_example("disponibilidade_vagas") | {PATIENT_DATA_FLAG: True},
        load_fixture("pacientes_por_profissional_semana") | {PATIENT_DATA_FLAG: True},
    ],
)
def test_flag_true_makes_any_block_sensitive(bloco):
    assert is_sensitive_block(bloco) is True


@pytest.mark.parametrize("value", ["true", "True", 1, 1.0, None, False, 0, [], {}, [True]])
def test_flag_is_strict_boolean_true(value):
    bloco = load_example("disponibilidade_vagas") | {PATIENT_DATA_FLAG: value}

    assert is_sensitive_block(bloco) is False


@pytest.mark.parametrize("value", [False, "false", None, 0])
def test_flag_false_does_not_override_the_rules(value):
    assert is_sensitive_block(pacientes_por_profissional_nomes() | {PATIENT_DATA_FLAG: value})


def test_flag_inside_dados_is_not_read():
    bloco = load_example("disponibilidade_vagas")
    bloco["dados"][PATIENT_DATA_FLAG] = True

    assert is_sensitive_block(bloco) is False


def unknown_to_the_rules(bloco):
    """The same block with a `tipo` (or `dados.relatorio`) that no rule knows."""
    if bloco["tipo"] == "tabela_generica":
        bloco["dados"]["relatorio"] = "relatorio_futuro"
    else:
        bloco["tipo"] = "tipo_futuro"
    return bloco


@pytest.mark.parametrize("name", OFFICIAL_SENSITIVE_EXAMPLES.values())
def test_official_example_has_the_flag_at_block_level(name):
    bloco = load_example(name)

    assert bloco[PATIENT_DATA_FLAG] is True
    assert PATIENT_DATA_FLAG not in bloco["dados"]


@pytest.mark.parametrize("name", OFFICIAL_SENSITIVE_EXAMPLES.values())
def test_official_example_is_sensitive_by_the_list_alone(name):
    bloco = load_example(name)
    del bloco[PATIENT_DATA_FLAG]

    assert is_sensitive_block(bloco) is True


@pytest.mark.parametrize("name", OFFICIAL_SENSITIVE_EXAMPLES.values())
def test_official_example_is_sensitive_by_the_flag_alone(name):
    bloco = unknown_to_the_rules(load_example(name))

    assert is_sensitive_block(bloco) is True
    del bloco[PATIENT_DATA_FLAG]
    assert is_sensitive_block(bloco) is False


@pytest.mark.parametrize(
    "name", ["tabela_generica_plano_realocacao", "tabela_generica_plano_realocacao_pergunta"]
)
def test_plano_realocacao_is_in_the_list_by_exact_relatorio(name):
    bloco = load_example(name)
    del bloco[PATIENT_DATA_FLAG]

    assert bloco["tipo"] == "tabela_generica"
    assert bloco["dados"]["relatorio"] == "plano_realocacao"
    assert {"tipo": "tabela_generica", "relatorio": "plano_realocacao"} in SENSITIVE_BLOCK_RULES
    assert is_sensitive_block(bloco) is True


@pytest.mark.parametrize("relatorio", PLANO_REALOCACAO_NEAR_MISSES)
def test_plano_realocacao_with_a_similar_relatorio_is_sensitive_only_by_the_flag(relatorio):
    flagged = with_relatorio(load_example("tabela_generica_plano_realocacao"), relatorio)

    assert flagged[PATIENT_DATA_FLAG] is True
    assert is_sensitive_block(flagged) is True
    assert is_sensitive_block(plano_realocacao_without_flag(relatorio)) is False


def test_panorama_enxugamento_is_in_the_list_by_exact_relatorio():
    bloco = panorama_without_flag()

    assert bloco["tipo"] == "tabela_generica"
    assert bloco["dados"]["relatorio"] == "panorama_enxugamento"
    assert {"tipo": "tabela_generica", "relatorio": "panorama_enxugamento"} in SENSITIVE_BLOCK_RULES
    assert is_sensitive_block(bloco) is True


def test_panorama_enxugamento_examples_have_the_contract_shape():
    """Two blocks (agent PR #20), both with the block-level flag, the same relatorio and null
    periodo/meta: the steps grouped in one level and the scenario comparison, not grouped."""
    passos = load_example(PANORAMA)
    comparativo = load_example(PANORAMA_COMPARATIVO)

    for bloco in (comparativo, passos):
        assert bloco[PATIENT_DATA_FLAG] is True
        assert bloco["dados"]["relatorio"] == "panorama_enxugamento"
        assert bloco["periodo"] is None and bloco["meta"] is None
    assert passos["dados"]["agrupar_por"] == ["cenario"]
    assert passos["dados"]["unidade_grupo"] == {"singular": "passo", "plural": "passos"}
    assert [t["nome"] for t in passos["tabelas"]] == ["Passos"]
    chaves = [c["chave"] for c in passos["dados"]["colunas"]]
    assert "tipo_de_movimento" in chaves and "alavanca" not in chaves
    assert "agrupar_por" not in comparativo["dados"]
    assert [t["nome"] for t in comparativo["tabelas"]] == ["Cenários"]
    assert [linha["recomendado"] for linha in comparativo["dados"]["linhas"]] == [
        True,
        False,
        False,
    ]


def test_panorama_full_answer_fixture_is_the_two_official_blocks_with_the_marker():
    resposta = load_fixture("resposta_panorama_enxugamento")

    assert resposta["resposta_sensivel"] is True
    assert resposta["blocos"] == [load_example(PANORAMA_COMPARATIVO), load_example(PANORAMA)]
    assert all(is_sensitive_block(b) for b in resposta["blocos"])


@pytest.mark.parametrize("relatorio", PANORAMA_NEAR_MISSES)
def test_panorama_enxugamento_with_a_similar_relatorio_is_sensitive_only_by_the_flag(relatorio):
    flagged = panorama_with_similar_relatorio(relatorio)

    assert flagged[PATIENT_DATA_FLAG] is True
    assert is_sensitive_block(flagged) is True
    assert is_sensitive_block(panorama_without_flag(relatorio)) is False


def test_restricted_message_wording():
    """The exact text users outside the coordination group get (also for HR data)."""
    assert PATIENT_REPORTS_RESTRICTED_MESSAGE == (
        "Este relatório contém dados sensíveis e está disponível apenas para a coordenação. "
        "Fale com a coordenação para solicitá-lo."
    )


@pytest.mark.parametrize("name", OFFICIAL_SENSITIVE_EXAMPLES.values())
def test_flag_moved_inside_dados_of_official_example_counts_only_through_the_list(name):
    unknown = unknown_to_the_rules(load_example(name))
    unknown["dados"][PATIENT_DATA_FLAG] = unknown.pop(PATIENT_DATA_FLAG)
    known = load_example(name)
    known["dados"][PATIENT_DATA_FLAG] = known.pop(PATIENT_DATA_FLAG)

    assert is_sensitive_block(unknown) is False
    assert is_sensitive_block(known) is True


def test_old_pacientes_por_profissional_has_no_names_and_is_its_own_type():
    bloco = load_fixture("pacientes_por_profissional_semana")

    assert bloco["tipo"] == "pacientes_por_profissional"
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
        {"tipo": "tabela_generica", "dados": {"relatorio": None}},
        {"tipo": "tabela_generica", "dados": {"relatorio": 1}},
        {"tipo": "tabela_generica", "dados": {"relatorio": {"x": 1}}},
        {"tipo": "tabela_generica", "dados": ["pacientes_por_profissional_nomes"]},
        {"tipo": "tabela_generica", "dados": {"relatorio": ["pacientes_por_profissional_nomes"]}},
        {"dados": {"relatorio": "pacientes_por_profissional_nomes"}},
        {"tipo": "convenio", "dados": {"relatorio": "pacientes_por_profissional_nomes"}},
        {PATIENT_DATA_FLAG: "true"},
        {PATIENT_DATA_FLAG: 1},
        {PATIENT_DATA_FLAG: None},
        {PATIENT_DATA_FLAG: {"x": True}},
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


@pytest.mark.parametrize(
    "make", [panorama_without_flag, panorama_with_similar_relatorio, lambda: load_example(PANORAMA)]
)
def test_panorama_answer_is_replaced_by_exactly_the_fixed_text(api, conversation, respx_mock, make):
    """List-only, flag-only and official: nothing the agent wrote (counts, scenario codes) nor
    anything of the block reaches the database or the API response."""
    bloco = make()
    mock_agent(respx_mock, [bloco], resposta=PANORAMA_ANSWER)

    response = post_message(api, conversation, content="Quais turnos dá para liberar?")

    assert response.status_code == 201
    answer = response.json()["assistant_message"]
    assert answer["content"] == PATIENT_REPORTS_RESTRICTED_MESSAGE
    assert "blocos" not in answer
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.content == PATIENT_REPORTS_RESTRICTED_MESSAGE
    assert stored.blocos == []
    leaked = (
        PANORAMA_ANSWER,
        "E-5EB1",
        "libera 3 turnos",
        "presença paga",
        bloco["titulo"],
        *sensitive_values(bloco),
    )
    body = response.content.decode()
    history = api.get(messages_url(conversation)).content.decode()
    text = stored_text(conversation)
    for value in leaked:
        assert value not in text
        assert value not in body
        assert value not in history


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
def test_panorama_reaches_members_untouched(request, api, conversation, respx_mock, member):
    request.getfixturevalue(member)
    bloco = load_example(PANORAMA)
    mock_agent(respx_mock, [bloco], resposta=PANORAMA_ANSWER)

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == PANORAMA_ANSWER
    assert answer["blocos"] == [load_example(PANORAMA)]
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert (stored.content, stored.blocos) == (PANORAMA_ANSWER, [load_example(PANORAMA)])
    assert history_blocos(api, conversation) == [load_example(PANORAMA)]


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


@pytest.mark.parametrize("name", NOT_SENSITIVE_EXAMPLES)
def test_non_sensitive_tabela_generica_and_counts_reach_users_without_group(
    api, conversation, respx_mock, name
):
    bloco = NOT_SENSITIVE_EXAMPLES[name]()
    mock_agent(respx_mock, [bloco])

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == ANSWER
    assert answer["blocos"] == [bloco]
    assert history_blocos(api, conversation) == [bloco]


def test_answer_without_sensitive_blocks_is_unchanged(api, conversation, respx_mock):
    comum = load_example("disponibilidade_vagas")
    mock_agent(respx_mock, [comum])

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == ANSWER
    assert answer["blocos"] == [comum]


def test_dropping_logs_only_the_count(api, conversation, respx_mock, caplog):
    blocos = [
        load_example("agenda_paciente"),
        pacientes_por_plano(),
        pacientes_por_profissional_nomes(),
        plano_realocacao_without_flag(),
        load_example("tabela_generica_plano_realocacao_pergunta"),
        panorama_without_flag(),
        panorama_with_similar_relatorio(),
    ]
    mock_agent(respx_mock, blocos, resposta=PANORAMA_ANSWER)

    with capture_all_logs(caplog):
        assert post_message(api, conversation).status_code == 201

    dropped = [r for r in caplog.records if "sensitive_blocks_dropped" in r.getMessage()]
    assert [r.getMessage().split(" ")[0] for r in dropped] == ["sensitive_blocks_dropped=7"]
    logged = all_log_text(caplog)
    for value in (
        PANORAMA_ANSWER,
        "E-5EB1",
        "agenda_paciente",
        "pacientes_por_plano",
        "pacientes_por_profissional_nomes",
        "plano_realocacao",
        "panorama_enxugamento",
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


@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_history_without_any_visible_block_has_no_blocos_key(api, conversation, name):
    record_exchange(conversation, "Pergunta", ANSWER, blocos=[SENSITIVE_EXAMPLES[name]()])

    assert history_blocos(api, conversation) is None


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
@pytest.mark.parametrize("name", SENSITIVE_EXAMPLES)
def test_history_shows_each_sensitive_block_to_members(request, api, conversation, member, name):
    request.getfixturevalue(member)
    bloco = SENSITIVE_EXAMPLES[name]()
    record_exchange(conversation, "Pergunta", ANSWER, blocos=[bloco])

    assert history_blocos(api, conversation) == [bloco]


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


@pytest.mark.parametrize("name", NOT_SENSITIVE_EXAMPLES)
def test_export_of_non_sensitive_tabela_generica_and_counts_works_without_group(api, name):
    response = export(api, [NOT_SENSITIVE_EXAMPLES[name]()])

    assert response.status_code == 200
    assert response["Content-Disposition"].startswith("attachment;")


# --- response-level marker (`resposta_sensivel`) -------------------------------------

# What the agent may write with no block at all (scenario not found, ambiguous professional):
# it can repeat a fictitious professional name typed by the user, so none of it may be stored.
SENSITIVE_TEXT_ANSWER = (
    "Encontrei duas profissionais chamadas Profissional Ficticia Ômega; qual delas você quer?"
)
SENSITIVE_TEXT_LEAKS = (SENSITIVE_TEXT_ANSWER, "Profissional Ficticia Ômega", "duas profissionais")


def mock_marked_agent(respx_mock, blocos, marker=True, resposta=SENSITIVE_TEXT_ANSWER):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "conversa_id": "ext-1",
                "resposta": resposta,
                "blocos": blocos,
                "resposta_sensivel": marker,
            },
        )
    )


def assert_only_the_fixed_text(api, conversation, response, leaks=SENSITIVE_TEXT_LEAKS):
    """POST response, history and database carry the fixed text and nothing of the answer."""
    assert response.status_code == 201
    assert response.json()["assistant_message"]["content"] == PATIENT_REPORTS_RESTRICTED_MESSAGE
    history = api.get(messages_url(conversation))
    assert history.json()["results"][1]["content"] == PATIENT_REPORTS_RESTRICTED_MESSAGE
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert stored.content == PATIENT_REPORTS_RESTRICTED_MESSAGE
    text = stored_text(conversation)
    for value in leaks:
        assert value not in text
        assert value not in response.content.decode()
        assert value not in history.content.decode()


def test_marker_without_blocks_replaces_the_text_for_users_without_group(
    api, conversation, respx_mock
):
    """(a) + (g): text-only sensitive answer, as when no scenario is found."""
    mock_marked_agent(respx_mock, [])

    response = post_message(api, conversation, content="Quais turnos da Ômega dá para liberar?")

    assert_only_the_fixed_text(api, conversation, response)
    assert "blocos" not in response.json()["assistant_message"]
    assert Message.objects.get(conversation=conversation, role="assistant").blocos == []


def test_marker_without_the_blocos_key_replaces_the_text(api, conversation, respx_mock):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "conversa_id": "ext-1",
                "resposta": SENSITIVE_TEXT_ANSWER,
                "resposta_sensivel": True,
            },
        )
    )

    assert_only_the_fixed_text(api, conversation, post_message(api, conversation))


def test_marker_with_a_sensitive_block_drops_it_and_replaces_the_text(
    api, conversation, respx_mock
):
    """(b)"""
    bloco = load_example(PANORAMA)
    mock_marked_agent(respx_mock, [bloco], resposta=PANORAMA_ANSWER)

    response = post_message(api, conversation)

    leaks = (PANORAMA_ANSWER, "E-5EB1", bloco["titulo"], *sensitive_values(bloco))
    assert_only_the_fixed_text(api, conversation, response, leaks)
    assert "blocos" not in response.json()["assistant_message"]
    assert Message.objects.get(conversation=conversation, role="assistant").blocos == []


def test_marker_with_a_common_block_keeps_it_and_replaces_the_text(api, conversation, respx_mock):
    """(f): no sensitive block, but the marker alone replaces the text; the common block stays."""
    comum = load_example("disponibilidade_vagas")
    mock_marked_agent(respx_mock, [comum])

    response = post_message(api, conversation)

    assert_only_the_fixed_text(api, conversation, response)
    assert response.json()["assistant_message"]["blocos"] == [comum]
    assert Message.objects.get(conversation=conversation, role="assistant").blocos == [comum]
    assert history_blocos(api, conversation) == [comum]


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
@pytest.mark.parametrize(
    "blocos",
    [[], [load_example(PANORAMA)], [load_example("disponibilidade_vagas")]],
    ids=["no-block", "sensitive-block", "common-block"],
)
def test_marker_changes_nothing_for_members(request, api, conversation, respx_mock, member, blocos):
    """(c)"""
    request.getfixturevalue(member)
    mock_marked_agent(respx_mock, blocos)

    response = post_message(api, conversation)

    answer = response.json()["assistant_message"]
    assert answer["content"] == SENSITIVE_TEXT_ANSWER
    assert answer.get("blocos", []) == blocos
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert (stored.content, stored.blocos) == (SENSITIVE_TEXT_ANSWER, blocos)
    history = api.get(messages_url(conversation)).json()["results"][1]
    assert history["content"] == SENSITIVE_TEXT_ANSWER


NON_TRUE_MARKERS = [False, "true", "True", 1, 1.0, None, [], {}, [True], {"valor": True}]


@pytest.mark.parametrize("marker", NON_TRUE_MARKERS)
def test_marker_other_than_true_is_ignored(api, conversation, respx_mock, marker):
    """(d): no replacement without a sensitive block..."""
    comum = load_example("disponibilidade_vagas")
    mock_marked_agent(respx_mock, [comum], marker=marker, resposta=ANSWER)

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == ANSWER
    assert answer["blocos"] == [comum]


@pytest.mark.parametrize("marker", NON_TRUE_MARKERS)
def test_marker_other_than_true_does_not_override_a_sensitive_block(
    api, conversation, respx_mock, marker
):
    """(d): ...and the block rules still apply."""
    mock_marked_agent(respx_mock, [load_example("agenda_paciente")], marker=marker)

    response = post_message(api, conversation)

    assert_only_the_fixed_text(api, conversation, response)
    assert "blocos" not in response.json()["assistant_message"]


def test_marker_inside_a_block_or_its_dados_is_ignored(api, conversation, respx_mock):
    """(e)"""
    comum = load_example("disponibilidade_vagas") | {"resposta_sensivel": True}
    comum["dados"]["resposta_sensivel"] = True
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(
            200, json={"conversa_id": "ext-1", "resposta": ANSWER, "blocos": [comum]}
        )
    )

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == ANSWER
    assert answer["blocos"] == [comum]


def test_answer_without_the_marker_works_as_before(api, conversation, respx_mock, caplog):
    """(i)"""
    comum = load_example("disponibilidade_vagas")
    mock_agent(respx_mock, [comum])

    with capture_all_logs(caplog):
        answer = post_message(api, conversation).json()["assistant_message"]

    assert (answer["content"], answer["blocos"]) == (ANSWER, [comum])
    assert "sensitive_" not in all_log_text(caplog)


@pytest.mark.parametrize(
    ("blocos", "expected"),
    [
        ([], ["sensitive_text_replaced=1"]),
        ([load_example("disponibilidade_vagas")], ["sensitive_text_replaced=1"]),
        (
            [load_example(PANORAMA), load_example("agenda_paciente")],
            ["sensitive_blocks_dropped=2", "sensitive_text_replaced=1"],
        ),
    ],
    ids=["no-block", "common-block", "sensitive-blocks"],
)
def test_replacement_logs_only_counts(api, conversation, respx_mock, caplog, blocos, expected):
    """(h)"""
    mock_marked_agent(respx_mock, blocos)

    with capture_all_logs(caplog):
        assert post_message(api, conversation).status_code == 201

    counted = [
        r.getMessage().split(" ")[0] for r in caplog.records if "sensitive_" in r.getMessage()
    ]
    assert counted == expected
    logged = all_log_text(caplog)
    for value in (
        *SENSITIVE_TEXT_LEAKS,
        "resposta_sensivel",
        "panorama_enxugamento",
        "agenda_paciente",
        *(b["titulo"] for b in blocos),
        *(v for b in blocos for v in sensitive_values(b)),
    ):
        assert value not in logged


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
def test_marker_logs_nothing_for_members(request, api, conversation, respx_mock, caplog, member):
    request.getfixturevalue(member)
    mock_marked_agent(respx_mock, [])

    with capture_all_logs(caplog):
        post_message(api, conversation)

    assert "sensitive_" not in all_log_text(caplog)


# --- panorama answer: two blocks + resposta_sensivel (agent PR #20) ------------------------
# The agent's own example of the whole answer (fictitious names), copied from its docs.


def panorama_answer():
    return load_fixture("resposta_panorama_enxugamento")


def mock_panorama_agent(respx_mock, **changes):
    respx_mock.post(REALOCAI_CHAT_URL).mock(
        return_value=httpx.Response(200, json=panorama_answer() | changes)
    )


def panorama_leaks(resposta):
    blocos = resposta["blocos"]
    return (
        resposta["resposta"],
        *(b["titulo"] for b in blocos),
        *(v for b in blocos for v in sensitive_values(b)),
    )


def test_panorama_answer_cuts_both_blocks_and_replaces_the_text_without_group(
    api, conversation, respx_mock, caplog
):
    mock_panorama_agent(respx_mock)

    with capture_all_logs(caplog):
        response = post_message(api, conversation, content="Quais turnos dá para liberar?")

    assert "blocos" not in response.json()["assistant_message"]
    assert_only_the_fixed_text(api, conversation, response, leaks=panorama_leaks(panorama_answer()))
    assert Message.objects.get(conversation=conversation, role="assistant").blocos == []
    assert "blocos" not in api.get(messages_url(conversation)).json()["results"][1]
    counted = [
        r.getMessage().split(" ")[0] for r in caplog.records if "sensitive_" in r.getMessage()
    ]
    assert counted == ["sensitive_blocks_dropped=2", "sensitive_text_replaced=1"]
    logged = all_log_text(caplog)
    for value in (*panorama_leaks(panorama_answer()), "panorama_enxugamento"):
        assert value not in logged


def test_panorama_marker_without_blocks_also_becomes_the_fixed_text(api, conversation, respx_mock):
    """E.g. scenario not found: the agent answers with text only, still marked as sensitive."""
    mock_panorama_agent(respx_mock, blocos=[])

    response = post_message(api, conversation, content="Quero ver o Cenário 9.")

    assert "blocos" not in response.json()["assistant_message"]
    assert_only_the_fixed_text(
        api, conversation, response, leaks=(panorama_answer()["resposta"], "Cenário 1")
    )


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
def test_panorama_answer_reaches_members_with_both_blocks_in_order(
    request, api, conversation, respx_mock, member
):
    request.getfixturevalue(member)
    resposta = panorama_answer()
    mock_panorama_agent(respx_mock)

    answer = post_message(api, conversation).json()["assistant_message"]

    assert answer["content"] == resposta["resposta"]
    assert answer["blocos"] == resposta["blocos"]
    assert [b["titulo"] for b in answer["blocos"]] == [
        "Comparativo de cenários",
        "Passos do cenário recomendado",
    ]
    stored = Message.objects.get(conversation=conversation, role="assistant")
    assert (stored.content, stored.blocos) == (resposta["resposta"], resposta["blocos"])
    assert history_blocos(api, conversation) == resposta["blocos"]


def test_panorama_history_hides_both_blocks_and_shows_them_again_to_the_group(
    api, user, conversation
):
    blocos = panorama_answer()["blocos"]
    common = load_example("disponibilidade_vagas")
    record_exchange(
        conversation, "Pergunta fictícia", ANSWER, blocos=[blocos[0], common, blocos[1]]
    )

    assert history_blocos(api, conversation) == [common]
    user.groups.add(Group.objects.get_or_create(name=PATIENT_REPORTS_GROUP)[0])
    assert history_blocos(api, conversation) == [blocos[0], common, blocos[1]]
    user.groups.clear()
    assert history_blocos(api, conversation) == [common]


@pytest.mark.parametrize("index", [0, 1], ids=["comparativo", "passos"])
def test_panorama_export_of_either_block_is_403_before_validating_the_body(api, caplog, index):
    """An invalid envelope (no titulo, tabelas not a list) still gets the 403, with no echo:
    the permission is checked before the body is validated."""
    bloco = panorama_answer()["blocos"][index]
    broken = {k: v for k, v in bloco.items() if k != "titulo"} | {"tabelas": "inválido"}

    with capture_all_logs(caplog):
        responses = [export(api, [bloco]), export(api, [broken])]

    for response in responses:
        assert response.status_code == 403
        assert response.json() == {"detail": PATIENT_REPORTS_FORBIDDEN}
        for value in sensitive_values(bloco):
            assert value not in response.content.decode()
            assert value not in all_log_text(caplog)


@pytest.mark.parametrize("member", ["coordinator", "superuser"])
def test_panorama_export_of_both_blocks_works_for_members(request, api, member):
    request.getfixturevalue(member)
    bloco = panorama_answer()["blocos"][0]
    broken = {k: v for k, v in bloco.items() if k != "titulo"} | {"tabelas": "inválido"}

    assert export(api, panorama_answer()["blocos"]).status_code == 200
    assert export(api, [broken]).status_code == 400  # members do reach the validation
