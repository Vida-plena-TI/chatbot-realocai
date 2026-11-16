"""Excel export of the official `plano_realocacao` examples (agent PR #16, fictitious names):
the grouped plan (tables "Passos" and "Resumo por opção") and the ambiguous-name question
("Candidatas"). The `api` user is in the coordination group; access is covered in
chat/tests/test_patient_reports.py. Assertions never print rows."""

import copy

import pytest

from reports.serializers import MAX_LINHAS

from .test_export import export, open_xlsx, rows
from .test_export_contract import assert_valid_sheet_names, load_example

pytestmark = pytest.mark.django_db

PLANO = "tabela_generica_plano_realocacao"
PERGUNTA = "tabela_generica_plano_realocacao_pergunta"


def expected_rows(tabela):
    return [[linha[c["chave"]] for c in tabela["colunas"]] for linha in tabela["linhas"]]


@pytest.mark.parametrize(
    ("name", "sheets"),
    [(PLANO, ["Passos", "Resumo por opção"]), (PERGUNTA, ["Candidatas"])],
)
def test_sheets_are_the_agent_tables_in_order(api, name, sheets):
    bloco = load_example(name)

    workbook = open_xlsx(export(api, [bloco]))

    assert workbook.sheetnames == ["Resumo", *sheets]
    assert_valid_sheet_names(workbook.sheetnames)
    for tabela in bloco["tabelas"]:
        assert rows(workbook[tabela["nome"]])[1:] == expected_rows(tabela)


def test_summary_has_no_period_nor_goal_and_lists_the_notices(api):
    bloco = load_example(PLANO)

    summary = open_xlsx(export(api, [bloco]))["Resumo"]

    assert summary["A2"].value == bloco["titulo"]
    assert summary["B2"].value is None  # periodo null
    assert summary["C2"].value is None  # meta null
    assert summary["E2"].value == " | ".join(bloco["avisos"])


def test_grouping_hint_does_not_change_the_steps_sheet(api):
    """The option column stays in the sheet and every step keeps the received order."""
    bloco = load_example(PLANO)
    passos = bloco["tabelas"][0]

    sheet = open_xlsx(export(api, [bloco]))["Passos"]

    assert [c.value for c in sheet[1]][0] == "Opção"
    assert [r[0] for r in rows(sheet)[1:]] == [linha["opcao"] for linha in passos["linhas"]]
    assert sheet["B2"].data_type == "n" and sheet["B2"].number_format == "0"  # passo, inteiro


def test_plan_and_question_together_get_unique_short_sheet_names(api):
    blocos = [load_example(PLANO), load_example(PERGUNTA)]

    workbook = open_xlsx(export(api, blocos))

    assert workbook.sheetnames == [
        "Resumo",
        "Passos (1)",
        "Resumo por opção (1)",
        "Candidatas (2)",
    ]
    assert_valid_sheet_names(workbook.sheetnames)
    assert workbook["Resumo"].max_row == 3


def with_steps(count):
    bloco = load_example(PLANO)
    passos = bloco["tabelas"][0]
    base = passos["linhas"]
    passos["linhas"] = [copy.deepcopy(base[i % len(base)]) for i in range(count)]
    return bloco


def test_steps_table_at_the_row_cap_exports(api):
    sheet = open_xlsx(export(api, [with_steps(MAX_LINHAS)]))["Passos"]

    assert MAX_LINHAS == 5000
    assert sheet.max_row == MAX_LINHAS + 1


def test_steps_table_over_the_row_cap_is_a_400_without_echo(api):
    response = export(api, [with_steps(MAX_LINHAS + 1)])

    assert response.status_code == 400
    assert set(response.json()) == {"detail"}
    body = response.content.decode()
    for value in (
        "Opção 1",
        *(linha["paciente"] for linha in load_example(PLANO)["dados"]["linhas"]),
    ):
        assert value not in body
