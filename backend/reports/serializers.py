"""Validation of the report blocks sent for export.

Only the envelope is required: `versao` (integer), `tipo`, `titulo` and, when present,
`tabelas` as a list. The block type list is open: a block whose `tipo` (or `versao`) is
not one the spreadsheet knows is accepted and dropped, never a 400. For the blocks that
are exported, `tabelas` is checked strictly (it is what gets written); `periodo`,
`meta`, `parcial` and `avisos` are optional and used only when well formed, otherwise the
cell stays empty. `resumo`, `dados` and any other key are ignored. Types are never
coerced ("0.8" is not a number) and numbers are never interpreted: a percentage above 1,
for instance, is exported as it came.
"""

import datetime
import re

from rest_framework import serializers

MAX_BLOCOS = 10
FORMATOS = ("percentual", "inteiro", "decimal", "data", "texto")
# Column format used for any value outside FORMATOS (e.g. one added later by the agent).
FALLBACK_FORMATO = "texto"
# Block types of contract `versao` 1 that the spreadsheet exports. Any other type is
# accepted and ignored. The names also go into the file name, so they must stay within
# ^[a-z0-9_]+$.
SUPPORTED_VERSAO = 1
EXPORTED_TIPOS = frozenset(
    {
        "ocupacao_profissional",
        "pacientes_por_profissional",
        "ocupacao_agregada",
        "disponibilidade",
        "convenio",
        "agenda_paciente",
        "qualidade_agenda",
        "tabela_generica",
    }
)
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Bounds that keep a single export cheap; the body size limit applies on top of them.
MAX_TEXT_LENGTH = 1000
MAX_AVISOS = 50
MAX_TABELAS = 20
MAX_COLUNAS = 50
MAX_LINHAS = 5000
MAX_CHAVES_POR_LINHA = 100

BLOCOS_COUNT = f"Envie de 1 a {MAX_BLOCOS} blocos."
NOTHING_TO_EXPORT = "Nenhum dos blocos enviados pode ser exportado."


def _is_number(value):
    return isinstance(value, int | float) and not isinstance(value, bool)


def _is_scalar(value):
    return value is None or isinstance(value, str | int | float | bool)


class StrictCharField(serializers.CharField):
    """A string, as sent: no coercion from numbers and no trimming."""

    default_error_messages = {"invalid": "Esperado um texto."}

    def __init__(self, **kwargs):
        kwargs.setdefault("trim_whitespace", False)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("max_length", MAX_TEXT_LENGTH)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid")
        return super().to_internal_value(data)


class StrictNumberField(serializers.Field):
    default_error_messages = {"invalid": "Esperado um número."}

    def to_internal_value(self, data):
        if not _is_number(data) or data != data or data in (float("inf"), float("-inf")):
            self.fail("invalid")
        return data

    def to_representation(self, value):
        return value


class StrictIntegerField(serializers.Field):
    default_error_messages = {"invalid": "Esperado um número inteiro."}

    def to_internal_value(self, data):
        if not isinstance(data, int) or isinstance(data, bool):
            self.fail("invalid")
        return data

    def to_representation(self, value):
        return value


class IsoDateField(StrictCharField):
    """An ISO date (AAAA-MM-DD), kept as the original string."""

    default_error_messages = {"invalid": "Esperada uma data no formato AAAA-MM-DD."}

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            if not ISO_DATE_PATTERN.match(value):
                raise ValueError
            datetime.date.fromisoformat(value)
        except ValueError:
            self.fail("invalid")
        return value


class LinhaField(serializers.Field):
    """A table row: an object of scalar values."""

    default_error_messages = {"invalid": "Cada linha deve ser um objeto com valores simples."}

    def to_internal_value(self, data):
        valid = (
            isinstance(data, dict)
            and len(data) <= MAX_CHAVES_POR_LINHA
            and all(
                isinstance(k, str)
                and _is_scalar(v)
                and not (isinstance(v, str) and len(v) > MAX_TEXT_LENGTH)
                for k, v in data.items()
            )
        )
        if not valid:
            self.fail("invalid")
        return data

    def to_representation(self, value):
        return value


class FormatoField(serializers.Field):
    """A column format; anything outside FORMATOS is exported as text."""

    def run_validation(self, data=serializers.empty):
        if data is None:
            return FALLBACK_FORMATO
        return super().run_validation(data)

    def to_internal_value(self, data):
        return data if data in FORMATOS else FALLBACK_FORMATO

    def to_representation(self, value):
        return value


class ColunaSerializer(serializers.Serializer):
    chave = StrictCharField(allow_blank=False, max_length=100)
    rotulo = StrictCharField(max_length=200)
    formato = FormatoField()


class TabelaSerializer(serializers.Serializer):
    nome = StrictCharField(max_length=100)
    colunas = serializers.ListField(child=ColunaSerializer(), min_length=1, max_length=MAX_COLUNAS)
    linhas = serializers.ListField(child=LinhaField(), max_length=MAX_LINHAS)


class PeriodoSerializer(serializers.Serializer):
    inicio = IsoDateField()
    fim = IsoDateField()


class BlocoSerializer(serializers.Serializer):
    versao = StrictIntegerField()
    tipo = StrictCharField(allow_blank=False, max_length=50)
    titulo = StrictCharField(max_length=200)
    # Items are only checked for exported blocks (see to_internal_value).
    tabelas = serializers.ListField(required=False, max_length=MAX_TABELAS)

    def to_internal_value(self, data):
        bloco = super().to_internal_value(data)
        if bloco["tipo"] not in EXPORTED_TIPOS or bloco["versao"] != SUPPORTED_VERSAO:
            return {**bloco, "exportado": False}

        try:
            tabelas = serializers.ListField(child=TabelaSerializer()).run_validation(
                bloco.get("tabelas", [])
            )
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({"tabelas": exc.detail}) from None
        return {
            **bloco,
            "exportado": True,
            "tabelas": tabelas,
            "periodo": _optional(PeriodoSerializer(), data.get("periodo")),
            "meta": _optional(StrictNumberField(), data.get("meta")),
            "parcial": data.get("parcial") is True,
            "avisos": _avisos(data.get("avisos")),
        }


def _optional(field, value):
    """The validated value, or None when it is missing or malformed."""
    if value is None:
        return None
    try:
        return field.run_validation(value)
    except serializers.ValidationError:
        return None


def _avisos(value):
    if not isinstance(value, list):
        return []
    return [aviso[:MAX_TEXT_LENGTH] for aviso in value if isinstance(aviso, str)][:MAX_AVISOS]


class ExportSerializer(serializers.Serializer):
    blocos = serializers.ListField(
        child=BlocoSerializer(),
        min_length=1,
        max_length=MAX_BLOCOS,
        error_messages={
            "min_length": BLOCOS_COUNT,
            "max_length": BLOCOS_COUNT,
            "empty": BLOCOS_COUNT,
            "required": BLOCOS_COUNT,
            "null": BLOCOS_COUNT,
            "not_a_list": BLOCOS_COUNT,
        },
    )

    def validate_blocos(self, blocos):
        """Keep only the blocks the spreadsheet exports, in the order received."""
        exportados = [bloco for bloco in blocos if bloco["exportado"]]
        if not exportados:
            raise serializers.ValidationError(NOTHING_TO_EXPORT)
        return exportados
