"""Export of the block types added to contract versao 1, using the agent's own examples
(fictitious data) copied to the SPA by frontend/scripts/sync-contrato.mjs."""

import copy
import datetime
import json
import re
from pathlib import Path

import pytest
from django.utils import timezone

from reports.serializers import EXPORTED_TIPOS

from .test_export import export, minimal_block, open_xlsx, rows

pytestmark = pytest.mark.django_db

EXEMPLOS = (
    Path(__file__).resolve().parents[3] / "frontend" / "src" / "reports" / "contrato" / "exemplos"
)
NEW_TYPES = {
    "disponibilidade": ["disponibilidade_vagas", "disponibilidade_janelas"],
    "convenio": ["convenio"],
    "agenda_paciente": ["agenda_paciente"],
    "qualidade_agenda": ["qualidade_agenda"],
    "tabela_generica": [
        "tabela_generica_ranking",
        "tabela_generica_capacidade",
        "tabela_generica_personalizado",
    ],
}
ALL_EXAMPLES = [name for names in NEW_TYPES.values() for name in names]
FORBIDDEN_SHEET_CHARS = re.compile(r"[\\/?*\[\]:]")


def load_example(name):
    """The block in `export default {...};` of a synced example file."""
    text = (EXEMPLOS / f"{name}.js").read_text(encoding="utf-8")
    return json.loads(text.split("export default ", 1)[1].rstrip().removesuffix(";"))


def assert_valid_sheet_names(names):
    assert all(0 < len(n) <= 31 for n in names)
    assert not any(FORBIDDEN_SHEET_CHARS.search(n) for n in names)
    assert len({n.lower() for n in names}) == len(names)


def test_examples_cover_the_five_new_types():
    assert {load_example(n)["tipo"] for n in ALL_EXAMPLES} == set(NEW_TYPES)
    assert set(NEW_TYPES) <= EXPORTED_TIPOS


@pytest.mark.parametrize("name", ALL_EXAMPLES)
def test_each_new_type_exports_one_sheet_per_table(api, name):
    bloco = load_example(name)
    today = timezone.localdate()

    response = export(api, [bloco])
    workbook = open_xlsx(response)

    assert (
        f'filename="realocai-{bloco["tipo"]}-{today:%Y-%m-%d}.xlsx"'
        in (response["Content-Disposition"])
    )
    assert workbook.sheetnames == ["Resumo", *[t["nome"] for t in bloco["tabelas"]]]
    assert_valid_sheet_names(workbook.sheetnames)
    assert workbook["Resumo"]["A2"].value == bloco["titulo"]
    for tabela in bloco["tabelas"]:
        sheet = workbook[tabela["nome"]]
        assert [c.value for c in sheet[1]] == [c["rotulo"] for c in tabela["colunas"]]
        assert sheet.max_row == len(tabela["linhas"]) + 1


def test_all_new_types_together_get_unique_sheet_names(api):
    blocos = [load_example(n) for n in ALL_EXAMPLES]
    # Long and forbidden-character table names, repeated across blocks.
    nome = "Ocupação: sala/posto [manhã]? * \\ por especialidade e dia"
    for bloco in blocos[:3]:
        bloco["tabelas"][0]["nome"] = nome

    workbook = open_xlsx(export(api, blocos))

    expected_tables = sum(len(b["tabelas"]) for b in blocos)
    assert len(workbook.sheetnames) == 1 + expected_tables
    assert_valid_sheet_names(workbook.sheetnames)
    assert workbook.sheetnames[1] == "Ocupação  sala posto  manhã (1)"
    assert workbook["Resumo"].max_row == 1 + len(blocos)


def test_long_and_forbidden_table_names_in_one_block(api):
    bloco = load_example("agenda_paciente")
    nome = "Sessões/intervalos: [semana]? de *Paciente* \\ muito longa"
    bloco["tabelas"] = [dict(t, nome=nome) for t in bloco["tabelas"]] + [
        dict(bloco["tabelas"][0], nome="[]:*?/\\")
    ]

    names = open_xlsx(export(api, [bloco])).sheetnames

    assert names == [
        "Resumo",
        "Sessões intervalos   semana   d",
        "Sessões intervalos   semana 2",
        "Tabela",
    ]
    assert_valid_sheet_names(names)


# --- Unknown types ------------------------------------------------------------------------


def unknown_block(**overrides):
    bloco = {
        "versao": 1,
        "tipo": "relatorio_do_futuro",
        "titulo": "Tipo que o backend ainda não conhece",
        "tabelas": [{"nome": "Não exportar", "qualquer": [1, {"x": None}]}, 7],
        "dados": {"livre": True},
    }
    bloco.update(overrides)
    return bloco


@pytest.mark.parametrize(
    "bloco",
    [
        unknown_block(),
        unknown_block(tipo="Tipo-Novo/../x"),
        unknown_block(tabelas=None) | {"periodo": "qualquer"},
        {**unknown_block(), "tipo": "convenio", "versao": 2},
    ],
    ids=["unknown", "odd-name", "no-tables", "future-version"],
)
def test_unknown_type_is_ignored_without_error(api, bloco):
    if bloco.get("tabelas") is None:
        bloco.pop("tabelas")
    known = load_example("convenio")

    response = export(api, [bloco, known, bloco])
    workbook = open_xlsx(response)

    assert workbook.sheetnames == ["Resumo", *[t["nome"] for t in known["tabelas"]]]
    summary = rows(workbook["Resumo"])
    assert [row[0] for row in summary[1:]] == [known["titulo"]]
    # Only the exported block names the file.
    assert "realocai-convenio-" in response["Content-Disposition"]


def test_only_unknown_types_is_a_clear_400(api):
    response = export(api, [unknown_block(), unknown_block(tipo="outro")])

    assert response.status_code == 400
    assert response.json() == {"detail": "Nenhum dos blocos enviados pode ser exportado."}


def test_unknown_type_still_needs_tables_as_a_list(api):
    response = export(api, [unknown_block(tabelas="nada"), load_example("convenio")])

    assert response.status_code == 400


# --- Cell values --------------------------------------------------------------------------


def test_percentages_dates_times_and_booleans(api):
    bloco = load_example("tabela_generica_personalizado")
    resultado = bloco["tabelas"][0]
    linha = resultado["linhas"][0]

    sheet = open_xlsx(export(api, [bloco]))["Resultado"]
    header = [c.value for c in sheet[1]]

    def cell(chave):
        rotulo = next(c["rotulo"] for c in resultado["colunas"] if c["chave"] == chave)
        return sheet.cell(row=2, column=header.index(rotulo) + 1)

    assert (cell("ocupacao").value, cell("ocupacao").number_format) == (linha["ocupacao"], "0.0%")
    assert cell("data").value == datetime.datetime.fromisoformat(linha["data"])
    assert cell("data").number_format == "dd/mm/yyyy"
    assert cell("abaixo_da_meta").value == ("Sim" if linha["abaixo_da_meta"] else "Não")


def test_times_stay_text_and_booleans_become_sim_nao(api):
    bloco = load_example("agenda_paciente")
    sessoes = bloco["tabelas"][0]
    sessoes["linhas"][0]["aguardando_autorizacao"] = True
    sessoes["linhas"][1]["aguardando_autorizacao"] = False

    sheet = open_xlsx(export(api, [bloco]))[sessoes["nome"]]
    keys = [c["chave"] for c in sessoes["colunas"]]
    inicio, fim = keys.index("inicio") + 1, keys.index("fim") + 1

    for row, linha in enumerate(sessoes["linhas"], start=2):
        for col in (inicio, fim):
            value = sheet.cell(row=row, column=col)
            assert (value.value, value.data_type) == (linha[keys[col - 1]], "s")
            assert re.fullmatch(r"\d{2}:\d{2}", value.value)
    flag = keys.index("aguardando_autorizacao") + 1
    assert sheet.cell(row=2, column=flag).value == "Sim"
    assert sheet.cell(row=3, column=flag).value == "Não"


def test_generic_table_cells(api):
    tabela = {
        "nome": "Valores",
        "colunas": [
            {"chave": "pct", "rotulo": "Pct", "formato": "percentual"},
            {"chave": "dia", "rotulo": "Dia", "formato": "data"},
            {"chave": "hora", "rotulo": "Hora", "formato": "texto"},
            {"chave": "ok", "rotulo": "Ok", "formato": "texto"},
            {"chave": "nota", "rotulo": "Nota", "formato": "texto"},
        ],
        "linhas": [
            {"pct": 0.25, "dia": "2026-09-28", "hora": "08:00", "ok": True, "nota": "=1+1"},
            {"pct": None, "dia": None, "hora": "", "ok": False, "nota": "+SUM(A1)"},
            {"nota": "-2"},
            {"nota": "@cmd"},
        ],
    }
    bloco = minimal_block(tipo="tabela_generica", tabelas=[tabela])

    sheet = open_xlsx(export(api, [bloco]))["Valores"]

    assert (sheet["A2"].value, sheet["A2"].number_format, sheet["A2"].data_type) == (
        0.25,
        "0.0%",
        "n",
    )
    assert sheet["B2"].value == datetime.datetime(2026, 9, 28)
    assert sheet["B2"].number_format == "dd/mm/yyyy"
    assert (sheet["C2"].value, sheet["C2"].data_type) == ("08:00", "s")
    assert (sheet["D2"].value, sheet["D3"].value) == ("Sim", "Não")
    assert [c.value for c in sheet[3]][:3] == [None, None, None]
    for ref, expected in (("E2", "=1+1"), ("E3", "+SUM(A1)"), ("E4", "-2"), ("E5", "@cmd")):
        assert (sheet[ref].value, sheet[ref].data_type) == (expected, "s")


def test_row_and_column_order_are_kept(api):
    bloco = load_example("tabela_generica_ranking")
    resultado = bloco["tabelas"][0]
    resultado["linhas"] = list(reversed(resultado["linhas"])) + [
        {"profissional": "Zeta Ficticia", "ocupacao": 0.99},
        {"profissional": "Alfa Ficticia", "ocupacao": 0.01},
    ]
    resultado["colunas"] = list(reversed(resultado["colunas"]))
    expected = copy.deepcopy(resultado)

    sheet = open_xlsx(export(api, [bloco]))[resultado["nome"]]

    assert [c.value for c in sheet[1]] == [c["rotulo"] for c in expected["colunas"]]
    col = [c["chave"] for c in expected["colunas"]].index("profissional") + 1
    assert [sheet.cell(row=r, column=col).value for r in range(2, sheet.max_row + 1)] == [
        linha["profissional"] for linha in expected["linhas"]
    ]
