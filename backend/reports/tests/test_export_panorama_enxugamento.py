"""Excel export of the `panorama_enxugamento` answer (agent PR #20, fictitious patient and
professional names): two tabela_generica blocks with the same `relatorio`, the scenario
comparison (sheet "Cenários", `recomendado` is a JSON boolean in a "texto" column) and the steps
of the recommended scenario (sheet "Passos", one-level grouping hint that is screen-only). The
`api` user is in the coordination group; access is covered in chat/tests/test_patient_reports.py.
Assertions never print rows."""

import copy

import pytest

from chat.tests.test_realocai_client import load_fixture
from reports.serializers import MAX_LINHAS

from .test_export import export, open_xlsx, rows
from .test_export_contract import assert_valid_sheet_names, load_example

pytestmark = pytest.mark.django_db

COMPARATIVO = "tabela_generica_panorama_enxugamento_comparativo"
PASSOS = "tabela_generica_panorama_enxugamento"
# Fictitious "other scenario" detail: only what differs from Cenário 1 (steps 1, 3, 4),
# empty `observacao` and a long notice. Same file as tabelaGenericaPanoramaPassosDetalhe.
DETALHE = "tabela_generica_panorama_passos_detalhe"


def expected_rows(tabela):
    """What the sheet must hold: values as received, "" as an empty cell, booleans as Sim/Não."""

    def shown(value):
        if isinstance(value, bool):
            return "Sim" if value else "Não"
        return None if value == "" else value

    return [[shown(linha[c["chave"]]) for c in tabela["colunas"]] for linha in tabela["linhas"]]


def column(sheet, tabela, chave):
    index = [c["chave"] for c in tabela["colunas"]].index(chave) + 1
    return [sheet.cell(row=r, column=index) for r in range(2, len(tabela["linhas"]) + 2)]


@pytest.mark.parametrize(("name", "sheet_name"), [(COMPARATIVO, "Cenários"), (PASSOS, "Passos")])
def test_each_block_exports_its_own_sheet_with_the_contract_columns_and_rows(api, name, sheet_name):
    bloco = load_example(name)
    (tabela,) = bloco["tabelas"]

    workbook = open_xlsx(export(api, [bloco]))

    assert workbook.sheetnames == ["Resumo", sheet_name]
    assert_valid_sheet_names(workbook.sheetnames)
    sheet = workbook[sheet_name]
    assert [c.value for c in sheet[1]] == [c["rotulo"] for c in tabela["colunas"]]
    assert rows(sheet)[1:] == expected_rows(tabela)


def test_recommended_boolean_in_a_text_column_is_sim_nao_text(api):
    bloco = load_example(COMPARATIVO)
    (tabela,) = bloco["tabelas"]
    assert [c["formato"] for c in tabela["colunas"] if c["chave"] == "recomendado"] == ["texto"]
    assert [linha["recomendado"] for linha in tabela["linhas"]] == [True, False, False]

    sheet = open_xlsx(export(api, [bloco]))["Cenários"]

    cells = column(sheet, tabela, "recomendado")
    assert [c.value for c in cells] == ["Sim", "Não", "Não"]
    assert all(c.data_type == "s" for c in cells)
    turnos = column(sheet, tabela, "turnos_liberados")
    assert all(c.data_type == "n" and c.number_format == "0" for c in turnos)


COVERAGE_COLUMNS = ["profissionais_sem_atendimento", "turnos_sem_profissional"]


def test_scenarios_sheet_has_the_coverage_columns_as_integers_in_contract_order(api):
    """Agent PR #21: two integer columns between trocam_de_dia and passos_iguais_ao_recomendado."""
    bloco = load_example(COMPARATIVO)
    (tabela,) = bloco["tabelas"]
    keys = [c["chave"] for c in tabela["colunas"]]
    start = keys.index("trocam_de_dia")
    assert keys[start : start + 4] == [
        "trocam_de_dia",
        *COVERAGE_COLUMNS,
        "passos_iguais_ao_recomendado",
    ]

    sheet = open_xlsx(export(api, [bloco]))["Cenários"]

    header = [c.value for c in sheet[1]]
    assert header[start + 1 : start + 3] == [
        "Profissionais sem atendimento",
        "Turnos sem profissional",
    ]
    for chave in COVERAGE_COLUMNS:
        cells = column(sheet, tabela, chave)
        assert [c.value for c in cells] == [linha[chave] for linha in tabela["linhas"]]
        assert all(type(c.value) is int and c.data_type == "n" for c in cells)
        assert all(c.number_format == "0" for c in cells)


def test_scenarios_sheet_without_the_coverage_columns_still_exports(api):
    """An agent without PR #21 sends the older shape: the sheet just has two columns fewer."""
    bloco = load_example(COMPARATIVO)
    for tabela in (bloco["tabelas"][0], bloco["dados"]):
        tabela["colunas"] = [c for c in tabela["colunas"] if c["chave"] not in COVERAGE_COLUMNS]
        for linha in tabela["linhas"]:
            for chave in COVERAGE_COLUMNS:
                linha.pop(chave)
    (tabela,) = bloco["tabelas"]

    sheet = open_xlsx(export(api, [bloco]))["Cenários"]

    assert [c.value for c in sheet[1]] == [c["rotulo"] for c in tabela["colunas"]]
    assert "Turnos sem profissional" not in [c.value for c in sheet[1]]
    assert rows(sheet)[1:] == expected_rows(tabela)


def test_steps_sheet_has_tipo_de_movimento_and_empty_observacao(api):
    bloco = load_example(PASSOS)
    (tabela,) = bloco["tabelas"]

    sheet = open_xlsx(export(api, [bloco]))["Passos"]

    header = [c.value for c in sheet[1]]
    assert "Tipo de movimento" in header and "Alavanca" not in header
    assert [linha["observacao"] for linha in tabela["linhas"]] == [""] * 4
    assert all(c.value is None for c in column(sheet, tabela, "observacao"))
    # The grouping column stays in the flat sheet; every step keeps the received order.
    assert header[:3] == ["Cenário", "Turno liberado", "Passo"]
    assert [r[2] for r in rows(sheet)[1:]] == [1, 2, 3, 4]
    assert sheet["C2"].data_type == "n" and sheet["C2"].number_format == "0"


@pytest.mark.parametrize("name", [COMPARATIVO, PASSOS])
def test_summary_has_no_period_nor_goal_and_lists_the_notices_whole(api, name):
    bloco = load_example(name)

    summary = open_xlsx(export(api, [bloco]))["Resumo"]

    assert summary["A2"].value == bloco["titulo"]
    assert summary["B2"].value is None  # periodo null
    assert summary["C2"].value is None  # meta null
    assert summary["E2"].value == " | ".join(bloco["avisos"])


def test_other_scenario_detail_keeps_gaps_title_and_long_notice(api):
    bloco = load_fixture(DETALHE)
    (tabela,) = bloco["tabelas"]

    workbook = open_xlsx(export(api, [bloco]))

    assert workbook.sheetnames == ["Resumo", "Passos"]
    assert workbook["Resumo"]["A2"].value == (
        "Passos do Cenário 2 (apenas o que difere do Cenário 1)"
    )
    assert workbook["Resumo"]["E2"].value == " | ".join(bloco["avisos"])
    assert max(len(a) for a in bloco["avisos"]) > 300
    sheet = workbook["Passos"]
    assert [r[2] for r in rows(sheet)[1:]] == [1, 3, 4]
    assert rows(sheet)[1:] == expected_rows(tabela)


def test_both_blocks_of_the_answer_get_unique_short_sheet_names(api):
    blocos = load_fixture("resposta_panorama_enxugamento")["blocos"]

    workbook = open_xlsx(export(api, blocos))

    assert workbook.sheetnames == ["Resumo", "Cenários (1)", "Passos (2)"]
    assert_valid_sheet_names(workbook.sheetnames)
    assert [r[0] for r in rows(workbook["Resumo"])[1:]] == [b["titulo"] for b in blocos]
    assert rows(workbook["Cenários (1)"])[1:] == expected_rows(blocos[0]["tabelas"][0])
    assert rows(workbook["Passos (2)"])[1:] == expected_rows(blocos[1]["tabelas"][0])


def test_with_another_block_sheet_names_stay_unique_and_short(api):
    blocos = [
        load_example(COMPARATIVO),
        load_example(PASSOS),
        load_example("tabela_generica_plano_realocacao"),
    ]

    workbook = open_xlsx(export(api, blocos))

    assert workbook.sheetnames == [
        "Resumo",
        "Cenários (1)",
        "Passos (2)",
        "Passos (3)",
        "Resumo por opção (3)",
    ]
    assert_valid_sheet_names(workbook.sheetnames)


def with_steps(count):
    bloco = load_example(PASSOS)
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
    linhas = load_example(PASSOS)["dados"]["linhas"]
    for value in (
        *(linha["paciente"] for linha in linhas),
        *(linha["turno_liberado"] for linha in linhas),
    ):
        assert value not in body
