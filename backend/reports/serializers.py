"""Strict validation of the report blocks sent for export.

Only the fields the spreadsheet uses are validated (titulo, periodo, meta, parcial,
avisos, resumo, tabelas); `dados` and any other key are ignored. Types are checked
strictly (no "0.8" for a number, no 1 for a boolean). Numbers are never interpreted:
a percentage above 1, for instance, is exported as it came.
"""

import datetime
import re

from rest_framework import serializers

MAX_BLOCOS = 10
FORMATOS = ("percentual", "inteiro", "decimal", "data", "texto")
TIPO_PATTERN = re.compile(r"^[a-z0-9_]{1,50}$")
ISO_DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Bounds that keep a single export cheap; the body size limit applies on top of them.
MAX_TEXT_LENGTH = 1000
MAX_AVISOS = 50
MAX_RESUMO = 50
MAX_TABELAS = 20
MAX_COLUNAS = 50
MAX_LINHAS = 5000
MAX_CHAVES_POR_LINHA = 100

BLOCOS_COUNT = f"Envie de 1 a {MAX_BLOCOS} blocos."


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


class StrictBooleanField(serializers.Field):
    default_error_messages = {"invalid": "Esperado verdadeiro ou falso."}

    def to_internal_value(self, data):
        if not isinstance(data, bool):
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


class ScalarField(serializers.Field):
    default_error_messages = {"invalid": "Esperado texto, número, booleano ou nulo."}

    def __init__(self, **kwargs):
        kwargs.setdefault("allow_null", True)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        if not _is_scalar(data) or (isinstance(data, str) and len(data) > MAX_TEXT_LENGTH):
            self.fail("invalid")
        return data

    def to_representation(self, value):
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


class FormatoField(serializers.ChoiceField):
    def __init__(self, **kwargs):
        super().__init__(
            choices=FORMATOS,
            error_messages={"invalid_choice": "Formato de coluna inválido."},
            **kwargs,
        )

    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail("invalid_choice", input=data)
        return super().to_internal_value(data)


class ColunaSerializer(serializers.Serializer):
    chave = StrictCharField(allow_blank=False, max_length=100)
    rotulo = StrictCharField(max_length=200)
    formato = FormatoField()


class TabelaSerializer(serializers.Serializer):
    nome = StrictCharField(max_length=100)
    colunas = serializers.ListField(child=ColunaSerializer(), min_length=1, max_length=MAX_COLUNAS)
    linhas = serializers.ListField(child=LinhaField(), max_length=MAX_LINHAS)


class ItemResumoSerializer(serializers.Serializer):
    rotulo = StrictCharField(max_length=200)
    valor = ScalarField()
    formato = FormatoField()
    exibicao = StrictCharField(max_length=200, required=False)


class PeriodoSerializer(serializers.Serializer):
    inicio = IsoDateField()
    fim = IsoDateField()


class BlocoSerializer(serializers.Serializer):
    tipo = StrictCharField(allow_blank=False, max_length=50)
    titulo = StrictCharField(max_length=200)
    periodo = PeriodoSerializer()
    # Required but nullable: blocks without a goal (e.g. patients per professional).
    meta = StrictNumberField(allow_null=True)
    parcial = StrictBooleanField()
    avisos = serializers.ListField(child=StrictCharField(), max_length=MAX_AVISOS)
    resumo = serializers.ListField(child=ItemResumoSerializer(), max_length=MAX_RESUMO)
    tabelas = serializers.ListField(child=TabelaSerializer(), max_length=MAX_TABELAS)

    def validate_tipo(self, value):
        if not TIPO_PATTERN.match(value):
            raise serializers.ValidationError("Tipo de relatório inválido.")
        return value


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
