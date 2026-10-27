"""Export of the weekly plan (`tabela_generica` with `relatorio: "plano_semanal"`), a
variation of contract versao 1 with no new type or field. Fictitious data only."""

import pytest

from core.tests.logs import all_log_text, capture_all_logs

from .test_export import export, load, minimal_block, open_xlsx, rows
from .test_export_contract import ALL_EXAMPLES, assert_valid_sheet_names, load_example
from .test_logs import assert_nothing_leaked

pytestmark = pytest.mark.django_db

PLANO = "tabela_generica_plano_semanal"
HEADER = ["Dia", "Situação", "Especialidade", "Horário", "Profissional", "Sala", "Posto"]


def plano():
    return load(PLANO)


def expected_rows(bloco):
    tabela = bloco["tabelas"][0]
    return [[linha[c["chave"]] for c in tabela["colunas"]] for linha in tabela["linhas"]]


def test_fixture_is_out_of_order_by_every_sortable_column():
    # Guards the order assertions: sorting by any of these would change the sequence.
    linhas = plano()["tabelas"][0]["linhas"]
    for key in ("dia", "horario", "situacao", "sala", "especialidade"):
        assert sorted(linhas, key=lambda linha, k=key: linha[k]) != linhas, key
    assert {linha["situacao"] for linha in linhas} == {"Plano", "Não coube", "Alternativa"}


def test_plan_exports_one_plano_sheet_with_rows_in_the_order_received(api):
    bloco = plano()

    workbook = open_xlsx(export(api, [bloco]))

    assert workbook.sheetnames == ["Resumo", "Plano"]
    assert_valid_sheet_names(workbook.sheetnames)
    sheet = workbook["Plano"]
    assert rows(sheet) == [HEADER, *expected_rows(bloco)]


def test_nao_coube_rows_keep_the_dash_as_text_and_null_posto_empty(api):
    bloco = plano()
    linhas = bloco["tabelas"][0]["linhas"]

    sheet = open_xlsx(export(api, [bloco]))["Plano"]

    nao_coube = [i for i, linha in enumerate(linhas, start=2) if linha["situacao"] == "Não coube"]
    assert len(nao_coube) == 2
    for row in nao_coube:
        for col in "DEF":  # horario, profissional, sala
            assert sheet[f"{col}{row}"].value == "—"
            assert sheet[f"{col}{row}"].data_type == "s"
        assert sheet[f"G{row}"].value is None
    plano_row = next(i for i, linha in enumerate(linhas, start=2) if linha["posto"] == 2)
    assert sheet[f"G{plano_row}"].value == 2
    assert sheet[f"G{plano_row}"].number_format == "0"


def test_plan_notice_goes_to_the_summary_like_the_other_types(api):
    bloco = plano()

    summary = open_xlsx(export(api, [bloco]))["Resumo"]

    assert rows(summary)[1][0] == bloco["titulo"]
    assert summary["B2"].value is None  # periodo null: the plan has no dates
    assert summary["C2"].value is None  # meta null
    assert summary["E2"].value == bloco["avisos"][0]
    assert "feriados e exceções" in summary["E2"].value


def test_title_like_table_name_gets_a_valid_sheet_name(api):
    # The sheet name comes from tabelas[].nome, never from titulo; even a long one with ":"
    # (like the plan's titulo) becomes a valid name.
    bloco = plano()
    bloco["tabelas"][0]["nome"] = bloco["titulo"]

    workbook = open_xlsx(export(api, [bloco]))

    assert_valid_sheet_names(workbook.sheetnames)
    assert workbook.sheetnames[1] == "Plano semanal  quarta e quinta,"
    assert rows(workbook[workbook.sheetnames[1]])[1:] == expected_rows(bloco)


def test_plan_with_the_other_examples_keeps_every_sheet(api):
    others = [load_example(name) for name in ALL_EXAMPLES]
    old = [load(name) for name in ("ocupacao_profissional", "ocupacao_agregada")]
    blocos = [*old, plano(), *others[:7]]

    workbook = open_xlsx(export(api, blocos))

    assert_valid_sheet_names(workbook.sheetnames)
    tabelas = [t for bloco in blocos for t in bloco["tabelas"]]
    assert len(workbook.sheetnames) == 1 + len(tabelas)
    plano_sheet = workbook[f"Plano ({len(old) + 1})"]
    assert rows(plano_sheet)[1:] == expected_rows(plano())
    for name, tabela in zip(workbook.sheetnames[1:], tabelas, strict=True):
        assert workbook[name].max_row == len(tabela["linhas"]) + 1


def test_plan_export_logs_no_block_content(api, caplog):
    bloco = plano()

    with capture_all_logs(caplog):
        response = export(api, [bloco])

    assert response.status_code == 200
    assert_nothing_leaked(caplog, [bloco])
    logged = all_log_text(caplog)
    for value in ("plano_semanal", "Não coube", "Alternativa", "Ana Lima", "Sala 10"):
        assert value not in logged
    assert not [r for r in caplog.records if r.name.startswith("reports")]


def test_official_plan_example_has_a_null_periodo():
    # The agent sends periodo: null (always present) in the plan; our fixture matches it.
    assert load_example(PLANO)["periodo"] is None
    assert "periodo" in plano() and plano()["periodo"] is None


@pytest.mark.parametrize("name", [*ALL_EXAMPLES, "minimal"])
def test_null_periodo_is_accepted_and_leaves_the_period_cell_empty(api, caplog, name):
    bloco = minimal_block() if name == "minimal" else load_example(name)
    bloco["periodo"] = None

    with capture_all_logs(caplog):
        response = export(api, [bloco])

    assert response.status_code == 200
    summary = open_xlsx(response)["Resumo"]
    assert summary["A2"].value == bloco["titulo"]
    assert summary["B2"].value is None
    assert_nothing_leaked(caplog, [bloco])


def test_null_and_filled_periodo_side_by_side(api, caplog):
    antigo = minimal_block()  # periodo 2026-10-05 to 2026-10-10, as before the change
    blocos = [plano(), antigo, load_example("tabela_generica_ranking")]

    with capture_all_logs(caplog):
        response = export(api, blocos)

    summary = open_xlsx(response)["Resumo"]
    assert [summary[f"B{row}"].value for row in (2, 3, 4)] == [
        None,
        "05/10 a 10/10/2026",
        "28/09 a 03/10/2026",
    ]
    assert_nothing_leaked(caplog, blocos)
