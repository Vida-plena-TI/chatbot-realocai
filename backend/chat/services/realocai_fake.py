"""Canned stand-in for RealocAI, enabled by settings.REALOCAI_USE_FAKE.

For local development and demos only: no network, no API key. It implements the same
interface as realocai_client.send_chat_message and answers with fixed texts and the
sample report blocks in fake_blocos/ (copied from RealocAI's real examples, with
fictitious data). It never interprets numbers: the blocks are returned as they are.
"""

import json
import re
import uuid
from functools import cache
from pathlib import Path

from chat.services.realocai_client import ChatSuccess, validate_blocos

SAMPLES_DIR = Path(__file__).resolve().parent / "fake_blocos"

DEFAULT_ANSWER = (
    "Resposta de demonstração (REALOCAI_USE_FAKE). Peça um relatório, por exemplo "
    '"ocupação da semana", "ocupação por especialidade", "pacientes por profissional" '
    'ou "relatório completo".'
)
PROPOSAL_ANSWER = (
    "Encontrei um horário que mantém a mesma profissional.\n\n"
    "```proposta\n"
    '{"paciente": "Paciente A",\n'
    ' "de": {"horario": "16:30", "sala": "Sala 2", "profissional": "Profissional B",'
    ' "dia": "Hoje"},\n'
    ' "para": {"horario": "10:00", "sala": "Sala 2", "profissional": "Profissional B",'
    ' "dia": "Hoje"},\n'
    ' "motivo": "Mantém a mesma profissional."}\n'
    "```"
)

# (pattern, answer, sample files); first match wins.
_RULES = [
    (
        r"relat[óo]rio completo",
        "Seguem os três relatórios da semana.",
        ["ocupacao_profissional", "pacientes_por_profissional_semana", "ocupacao_agregada"],
    ),
    (
        r"pacientes",
        "Segue o número de pacientes por profissional na semana.",
        ["pacientes_por_profissional_semana"],
    ),
    (
        r"especialidade|sala|agregad",
        "Segue a ocupação por especialidade e por sala.",
        ["ocupacao_agregada"],
    ),
    (
        r"ocupa|relat[óo]rio",
        "Segue a ocupação da profissional na semana.",
        ["ocupacao_profissional"],
    ),
    (r"realoc|encaix|remarc", PROPOSAL_ANSWER, []),
]


@cache
def _sample(name):
    with (SAMPLES_DIR / f"{name}.json").open(encoding="utf-8") as fh:
        return json.load(fh)


def send_chat_message(conversa_id, mensagem):
    conversa_id = conversa_id or f"fake-{uuid.uuid4().hex}"
    for pattern, answer, samples in _RULES:
        if re.search(pattern, mensagem, re.IGNORECASE):
            # Fresh copies: callers may store or mutate them.
            blocos, dropped = validate_blocos([json.loads(json.dumps(_sample(s))) for s in samples])
            return ChatSuccess(conversa_id, answer, blocos, dropped)
    return ChatSuccess(conversa_id, DEFAULT_ANSWER)
