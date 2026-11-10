"""Export of a grouped `tabela_generica` (patient names per professional) carrying the
optional `dados.agrupar_por` and `dados.unidade_grupo` fields, which the agent will add
without changing contract versao 1. Grouping is screen/PDF presentation only: the
spreadsheet keeps writing `tabelas` as received. Fictitious data only."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from chat.services.sensitive import is_sensitive_block
from core.tests.logs import all_log_text, capture_all_logs
from reports.serializers import ExportSerializer
from reports.views import PATIENT_REPORTS_FORBIDDEN

from .test_export import export, load, open_xlsx, rows
from .test_export_contract import assert_valid_sheet_names
from .test_logs import assert_nothing_leaked

pytestmark = pytest.mark.django_db

# Copy of the frontend fixture `tabelaGenericaPacientesNomesAgrupada` (sampleBlocks.js);
# `npm run check:fixtures` keeps both sides equal.
AGRUPADA = "tabela_generica_pacientes_por_profissional_nomes_agrupada"


def agrupada():
    return load(AGRUPADA)


def expected_rows(tabela):
    return [[linha[c["chave"]] for c in tabela["colunas"]] for linha in tabela["linhas"]]


def test_fixture_carries_the_new_fields_and_is_in_agent_order():
    bloco = agrupada()
    dados = bloco["dados"]

    assert dados["agrupar_por"] == ["especialidade", "profissional"]
    assert dados["unidade_grupo"] == {"singular": "paciente", "plural": "pacientes"}
    assert bloco["contem_dados_pacientes"] is True
    assert bloco["periodo"] is None and bloco["meta"] is None
    assert [t["nome"] for t in bloco["tabelas"]] == ["Pacientes", "Resumo por profissional"]
    linhas = bloco["tabelas"][0]["linhas"]
    assert len(linhas) == 800
    # Guards the order assertions: sorting by any of these would change the sequence.
    for key in ("paciente", "dias", "atendimentos_semana"):
        assert sorted(linhas, key=lambda linha, k=key: linha[k]) != linhas, key
    # A null especialidade comes last, as the agent sends it.
    assert linhas[-1]["especialidade"] is None


def test_new_fields_in_dados_pass_the_envelope_validation():
    serializer = ExportSerializer(data={"formato": "excel", "blocos": [agrupada()]})

    assert serializer.is_valid(), serializer.errors
    (bloco,) = serializer.validated_data["blocos"]
    assert bloco["exportado"] is True


def test_grouped_block_exports_both_tables_without_changing_rows_or_order(api, caplog):
    bloco = agrupada()

    with capture_all_logs(caplog):
        response = export(api, [bloco])

    assert response.status_code == 200
    workbook = open_xlsx(response)
    assert workbook.sheetnames == ["Resumo", "Pacientes", "Resumo por profissional"]
    assert_valid_sheet_names(workbook.sheetnames)
    for tabela in bloco["tabelas"]:
        header = [c["rotulo"] for c in tabela["colunas"]]
        assert rows(workbook[tabela["nome"]]) == [header, *expected_rows(tabela)]
    # Grouping never reaches the spreadsheet: no extra sheet, no group title rows.
    assert workbook["Pacientes"].max_row == 801
    assert workbook["Resumo por profissional"].max_row == 34
    # LGPD: no block content (names, titles, rows) in any log record.
    assert_nothing_leaked(caplog, [bloco])
    assert "Paciente Fictício" not in all_log_text(caplog)
    assert not [r for r in caplog.records if r.name.startswith("reports")]


def test_grouped_block_stays_restricted_to_the_coordination_group(db, caplog):
    bloco = agrupada()
    assert is_sensitive_block(bloco)
    outsider = get_user_model().objects.create_user(
        email="fora.do.grupo@exemplo.com", password="senha-forte-123"
    )
    client = APIClient()
    client.force_login(outsider)

    with capture_all_logs(caplog):
        response = export(client, [bloco])

    assert response.status_code == 403
    assert response.json() == {"detail": PATIENT_REPORTS_FORBIDDEN}
    assert_nothing_leaked(caplog, [bloco])
