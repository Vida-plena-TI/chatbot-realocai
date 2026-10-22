"""LGPD: exporting reports never logs block contents, names, table rows or the body."""

import json

import pytest

from core.tests.logs import all_log_text, capture_all_logs, strings_in

from .test_export import URL, export
from .test_export_contract import ALL_EXAMPLES, load_example

pytestmark = pytest.mark.django_db

PATIENT = "Paciente Ficticio Alfa"


def sensitive_values(blocos):
    # Short values ("Sala 1", "Manhã") could match log text by chance; real names and
    # titles are longer.
    return {value for value in strings_in(blocos) if len(value) >= 8}


def assert_captured_request_log(caplog):
    # Proves the capture is live: Django logs every 4xx under django.request.
    assert any(record.name == "django.request" for record in caplog.records)


def assert_nothing_leaked(caplog, blocos, body=None):
    logged = all_log_text(caplog)
    assert PATIENT not in logged
    for value in sensitive_values(blocos):
        assert value not in logged
    if body is not None:
        assert body not in logged


def test_examples_carry_the_patient_name():
    # Guards the assertions below: the agenda example must contain the name we look for.
    bloco = load_example("agenda_paciente")
    assert PATIENT in bloco["titulo"]
    assert len(sensitive_values([bloco])) > 10


def test_successful_export_logs_no_content(api, caplog):
    blocos = [load_example(name) for name in ALL_EXAMPLES]

    with capture_all_logs(caplog):
        response = export(api, blocos)

    assert response.status_code == 200
    assert_nothing_leaked(caplog, blocos)


@pytest.mark.parametrize(
    "change",
    [
        {"versao": "1"},
        {"titulo": None},
        {"tabelas": [{"nome": PATIENT, "colunas": [], "linhas": []}]},
        {"tabelas": "Agenda de " + PATIENT},
    ],
    ids=["versao", "titulo", "colunas", "tabelas"],
)
def test_rejected_export_logs_no_content(api, caplog, change):
    bloco = load_example("agenda_paciente") | change

    with capture_all_logs(caplog):
        response = export(api, [bloco])

    assert response.status_code == 400
    assert PATIENT not in response.content.decode()
    assert_captured_request_log(caplog)
    assert_nothing_leaked(caplog, [bloco])


def test_unknown_types_only_logs_no_content(api, caplog):
    bloco = load_example("agenda_paciente") | {"tipo": "agenda_paciente_v2"}

    with capture_all_logs(caplog):
        response = export(api, [bloco])

    assert response.status_code == 400
    assert_nothing_leaked(caplog, [bloco])


def test_body_above_the_limit_logs_no_content(api, caplog, settings):
    bloco = load_example("agenda_paciente")
    settings.REPORTS_EXPORT_MAX_BYTES = len(json.dumps([bloco])) // 2
    body = json.dumps({"formato": "excel", "blocos": [bloco]}, ensure_ascii=False)

    with capture_all_logs(caplog):
        response = api.post(URL, body.encode(), content_type="application/json")

    assert response.status_code == 413
    assert PATIENT not in response.content.decode()
    assert_captured_request_log(caplog)
    assert_nothing_leaked(caplog, [bloco], body)


def test_malformed_json_logs_no_content(api, caplog):
    body = '{"formato": "excel", "blocos": [{"titulo": "Agenda de ' + PATIENT + '"'

    with capture_all_logs(caplog):
        response = api.post(URL, body, content_type="application/json")

    assert response.status_code == 400
    assert PATIENT not in all_log_text(caplog)


# --- Count of skipped unknown blocks ------------------------------------------------------


def unknown_blocks():
    """Two blocks the export skips: an unknown type and a known type of a future versao."""
    renamed = load_example("agenda_paciente") | {"tipo": "agenda_paciente_futura"}
    future = load_example("convenio") | {"versao": 2}
    return [renamed, future]


def skipped_logs(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "reports.serializers"]


def assert_no_block_content(caplog, blocos):
    logged = all_log_text(caplog)
    for value in ("agenda_paciente_futura", "convenio", *sensitive_values(blocos)):
        assert value not in logged
    assert_nothing_leaked(caplog, blocos)


def test_skipped_unknown_blocks_are_counted_without_content(api, caplog):
    blocos = [*unknown_blocks(), load_example("qualidade_agenda")]

    with capture_all_logs(caplog):
        response = export(api, blocos)

    assert response.status_code == 200
    assert skipped_logs(caplog) == ["skipped_unknown_blocks=2"]
    record = next(r for r in caplog.records if r.name == "reports.serializers")
    assert record.levelname == "INFO"
    assert_no_block_content(caplog, blocos)


def test_no_skipped_count_when_every_block_is_known(api, caplog):
    blocos = [load_example(name) for name in ("agenda_paciente", "convenio")]

    with capture_all_logs(caplog):
        response = export(api, blocos)

    assert response.status_code == 200
    assert skipped_logs(caplog) == []
    assert "skipped_unknown_blocks" not in all_log_text(caplog)


def test_only_unknown_blocks_is_400_and_logs_only_the_count(api, caplog):
    blocos = unknown_blocks()

    with capture_all_logs(caplog):
        response = export(api, blocos)

    assert response.status_code == 400
    assert response.json() == {"detail": "Nenhum bloco exportável."}
    assert skipped_logs(caplog) == ["skipped_unknown_blocks=2"]
    assert_captured_request_log(caplog)
    assert_no_block_content(caplog, blocos)
