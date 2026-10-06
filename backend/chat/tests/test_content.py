import pytest

from chat.services.content import strip_proposal, summarize, title_from

PROPOSAL = (
    '```proposta\n{"paciente": "Paciente A",\n'
    ' "de": {"horario": "16:30", "sala": "Sala 2", "profissional": "Profissional B"},\n'
    ' "para": {"horario": "10:00", "sala": "Sala 2", "profissional": "Profissional B"},\n'
    ' "motivo": "Mantém a mesma profissional."}\n```'
)


def test_title_collapses_whitespace():
    assert title_from("  Horários   livres\n\tamanhã  ") == "Horários livres amanhã"


def test_title_is_kept_up_to_60_characters():
    text = "a" * 60
    assert title_from(text) == text


def test_title_is_clipped_at_60_with_ellipsis():
    title = title_from("palavra " * 20)

    assert len(title) == 60
    assert title.endswith("…")
    assert title == ("palavra " * 20).strip()[:59] + "…"


def test_preview_removes_a_valid_proposal_block():
    content = f"Encontrei uma opção melhor.\n\n{PROPOSAL}\n\nConfirma?"

    assert summarize(content) == "Encontrei uma opção melhor. Confirma?"


def test_preview_accepts_a_json_block_too():
    content = PROPOSAL.replace("```proposta", "```json") + "\nTexto depois."

    assert summarize(content) == "Texto depois."


@pytest.mark.parametrize(
    "block",
    [
        "```proposta\nnão é json\n```",
        '```proposta\n{"paciente": "Paciente A"}\n```',  # no "para"
        '```proposta\n{"paciente": "", "para": {}}\n```',  # empty paciente is falsy
        '```proposta\n["lista"]\n```',
    ],
    ids=["invalid-json", "no-para", "empty-paciente", "not-object"],
)
def test_preview_keeps_blocks_that_are_not_proposals(block):
    content = f"Veja:\n{block}"

    assert strip_proposal(content) == content
    assert summarize(content).startswith("Veja: ```proposta")


def test_preview_collapses_whitespace_and_newlines():
    assert summarize("  Linha 1\n\n   Linha   2\t\n") == "Linha 1 Linha 2"


def test_preview_is_clipped_at_90_with_ellipsis():
    preview = summarize("x" * 200)

    assert len(preview) == 90
    assert preview == "x" * 89 + "…"


def test_preview_of_exactly_90_characters_is_not_clipped():
    assert summarize("y" * 90) == "y" * 90


def test_preview_of_only_a_proposal_is_empty():
    assert summarize(PROPOSAL) == ""
