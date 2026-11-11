"""Report blocks that carry patient data, and who may see them.

Single source of truth for the chat turn (blocks dropped before they are stored), the
history endpoint (blocks hidden on read) and the export (403). Blocks are opaque JSON,
so the checks only look at `tipo`, `dados.relatorio` and the optional
`contem_dados_pacientes` flag, and never raise on malformed input.
"""

PATIENT_REPORTS_GROUP = "coordenacao"

# Each rule matches a block whose fields equal every given value; "relatorio" is read
# from `dados.relatorio`. EVERY NEW BLOCK TYPE (or `relatorio` value) THAT CARRIES
# PATIENT DATA MUST BE ADDED HERE, otherwise any logged-in user will receive it.
SENSITIVE_BLOCK_RULES = (
    {"tipo": "agenda_paciente"},
    {"tipo": "tabela_generica", "relatorio": "pacientes_por_plano"},
    {"tipo": "tabela_generica", "relatorio": "pacientes_por_profissional_nomes"},
)

# Optional block-level flag (optional in contract version 1 since agent PR #15): RealocAI
# sends `"contem_dados_pacientes": true` on the block types with patient data. Only the JSON
# boolean `true` counts ("true", 1 or null do not); a block without it falls back to
# SENSITIVE_BLOCK_RULES, so the list above stays mandatory.
PATIENT_DATA_FLAG = "contem_dados_pacientes"

PATIENT_REPORTS_RESTRICTED_MESSAGE = (
    "Este relatório contém dados de pacientes e está disponível apenas para a "
    "coordenação. Fale com a coordenação para solicitá-lo."
)


def is_sensitive_block(bloco) -> bool:
    """True when the block is flagged with `contem_dados_pacientes: true` or matches a
    SENSITIVE_BLOCK_RULES entry (exact string equality). Never raises."""
    if not isinstance(bloco, dict):
        return False
    if bloco.get(PATIENT_DATA_FLAG) is True:
        return True
    dados = bloco.get("dados")
    fields = {
        "tipo": bloco.get("tipo"),
        "relatorio": dados.get("relatorio") if isinstance(dados, dict) else None,
    }
    return any(
        all(_equals(fields[key], value) for key, value in rule.items())
        for rule in SENSITIVE_BLOCK_RULES
    )


def _equals(actual, expected):
    # Only strings can match: avoids surprising __eq__ on odd JSON values.
    return isinstance(actual, str) and actual == expected


def can_view_patient_reports(user) -> bool:
    """Superusers and active members of PATIENT_REPORTS_GROUP."""
    if user is None or not getattr(user, "is_authenticated", False) or not user.is_active:
        return False
    return user.is_superuser or user.groups.filter(name=PATIENT_REPORTS_GROUP).exists()


def split_sensitive_blocks(blocos) -> tuple[list, int]:
    """(blocks without the sensitive ones, in order; how many were removed)."""
    if not isinstance(blocos, list):
        return [], 0
    kept = [bloco for bloco in blocos if not is_sensitive_block(bloco)]
    return kept, len(blocos) - len(kept)
