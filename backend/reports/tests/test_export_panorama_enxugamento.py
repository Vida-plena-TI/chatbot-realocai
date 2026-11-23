"""Excel export of the official `panorama_enxugamento` example (agent PR #18, fictitious patient
and professional names): tables "Passos" and "Resumo dos cenários", flat (the two-level grouping
hint is screen-only). The `api` user is in the coordination group; access is covered in
chat/tests/test_patient_reports.py. Assertions never print rows."""

import copy

import pytest

from reports.serializers import MAX_LINHAS

from .test_export import export, open_xlsx, rows
from .test_export_contract import assert_valid_sheet_names, load_example

pytestmark = pytest.mark.django_db

PANORAMA = "tabela_generica_panorama_enxugamento"
SHEETS = ["Passos", "Resumo dos cenários"]


def expected_rows(tabela):
    return [[linha[c["chave"]] for c in tabela["colunas"]] for linha in tabela["linhas"]]


def test_sheets_are_the_agent_tables_in_order(api):
    bloco = load_example(PANORAMA)

    workbook = open_xlsx(export(api, [bloco]))

    assert workbook.sheetnames == ["Resumo", *SHEETS]
    assert_valid_sheet_names(workbook.sheetnames)
    for tabela in bloco["tabelas"]:
        sheet = workbook[tabela["nome"]]
        assert [c.value for c in sheet[1]] == [c["rotulo"] for c in tabela["colunas"]]
        assert rows(sheet)[1:] == expected_rows(tabela)


def test_summary_has_no_period_nor_goal_and_lists_the_notices(api):
    bloco = load_example(PANORAMA)

    summary = open_xlsx(export(api, [bloco]))["Resumo"]

    assert summary["A2"].value == bloco["titulo"]
    assert summary["B2"].value is None  # periodo null
    assert summary["C2"].value is None  # meta null
    assert summary["E2"].value == " | ".join(bloco["avisos"])


def test_grouping_hint_does_not_change_the_steps_sheet(api):
    """Both grouping columns stay in the sheet and every step keeps the received order."""
    bloco = load_example(PANORAMA)
    passos = bloco["tabelas"][0]

    sheet = open_xlsx(export(api, [bloco]))["Passos"]

    assert [c.value for c in sheet[1]][:3] == ["Cenário", "Turno liberado", "Passo"]
    assert [r[:2] for r in rows(sheet)[1:]] == [
        [linha["cenario"], linha["turno_liberado"]] for linha in passos["linhas"]
    ]
    assert sheet["C2"].data_type == "n" and sheet["C2"].number_format == "0"  # passo, inteiro


def test_scenario_summary_keeps_numeric_formats_and_empty_nulls(api):
    bloco = load_example(PANORAMA)
    resumo = bloco["tabelas"][1]
    chaves = [c["chave"] for c in resumo["colunas"]]
    bloco_null = copy.deepcopy(bloco)
    bloco_null["tabelas"][1]["linhas"][0]["ocupacao_absorventes"] = None  # nobody absorbs

    sheet = open_xlsx(export(api, [bloco]))["Resumo dos cenários"]
    sheet_null = open_xlsx(export(api, [bloco_null]))["Resumo dos cenários"]

    medio = sheet.cell(row=2, column=chaves.index("minutos_medio") + 1)
    ocupacao = sheet.cell(row=2, column=chaves.index("ocupacao_absorventes") + 1)
    assert medio.data_type == "n" and medio.number_format == "0.0"
    assert ocupacao.data_type == "n" and ocupacao.number_format == "0.0%"
    assert sheet_null.cell(row=2, column=chaves.index("ocupacao_absorventes") + 1).value is None


def test_with_another_block_sheet_names_stay_unique_and_short(api):
    blocos = [load_example(PANORAMA), load_example("tabela_generica_plano_realocacao")]

    workbook = open_xlsx(export(api, blocos))

    assert workbook.sheetnames == [
        "Resumo",
        "Passos (1)",
        "Resumo dos cenários (1)",
        "Passos (2)",
        "Resumo por opção (2)",
    ]
    assert_valid_sheet_names(workbook.sheetnames)


def with_steps(count):
    bloco = load_example(PANORAMA)
    passos = bloco["tabelas"][0]
    base = passos["linhas"]
    passos["linhas"] = [copy.deepcopy(base[i % len(base)]) for i in range(count)]
    return bloco


def test_steps_table_at_the_row_cap_exports_in_order(api):
    bloco = with_steps(MAX_LINHAS)

    sheet = open_xlsx(export(api, [bloco]))["Passos"]

    assert MAX_LINHAS == 5000
    assert sheet.max_row == MAX_LINHAS + 1
    assert rows(sheet)[1:] == expected_rows(bloco["tabelas"][0])


def test_steps_table_over_the_row_cap_is_a_400_without_echo(api):
    response = export(api, [with_steps(MAX_LINHAS + 1)])

    assert response.status_code == 400
    assert set(response.json()) == {"detail"}
    body = response.content.decode()
    linhas = load_example(PANORAMA)["dados"]["linhas"]
    for value in (
        "E-5EB1",
        *(linha["paciente"] for linha in linhas),
        *(linha["turno_liberado"] for linha in linhas),
    ):
        assert value not in body
