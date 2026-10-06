"""Public representations of the chat models, following the SPA's mock client.

Internal fields (external_conversation_id, the memory `summary`, metadata, token
counts, processing_started_at) are deliberately left out. The API's `summary` is the
sidebar preview (Conversation.preview), not the internal memory summary.
"""

from django.conf import settings
from rest_framework import serializers

from .models import Conversation, Message

TITLE_MAX_LENGTH = 120
EMPTY_MESSAGE = "A mensagem não pode ficar vazia."
INVALID_STATUS = "Status inválido."


class TitleField(serializers.CharField):
    """Trimmed and silently cut to TITLE_MAX_LENGTH (like the mock), never an error."""

    def __init__(self, **kwargs):
        super().__init__(allow_blank=True, required=False, **kwargs)

    def to_internal_value(self, data):
        return super().to_internal_value(data).strip()[:TITLE_MAX_LENGTH]


class ConversationSerializer(serializers.ModelSerializer):
    """Read and PATCH representation: only `title` and `status` are writable."""

    title = TitleField()
    status = serializers.ChoiceField(
        choices=Conversation.Status.choices,
        required=False,
        error_messages={"invalid_choice": INVALID_STATUS, "null": INVALID_STATUS},
    )
    summary = serializers.CharField(source="preview", read_only=True)
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "title",
            "status",
            "summary",
            "message_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_message_count(self, obj) -> int:
        # Annotated by the list/detail queryset; computed for freshly saved objects.
        count = getattr(obj, "message_count", None)
        return obj.messages.count() if count is None else count


class ConversationCreateSerializer(ConversationSerializer):
    """New conversations always start active."""

    status = serializers.CharField(read_only=True)


class MessageSerializer(serializers.ModelSerializer):
    """`blocos` only appears when the message has report blocks (like the mock)."""

    class Meta:
        model = Message
        fields = ["id", "seq", "role", "content", "blocos", "created_at"]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not data.get("blocos"):
            data.pop("blocos", None)
        return data


class MessageCreateSerializer(serializers.Serializer):
    # trim_whitespace (default) turns whitespace-only content into a blank error.
    content = serializers.CharField(
        error_messages={key: EMPTY_MESSAGE for key in ("blank", "required", "null")}
    )

    def validate_content(self, value):
        # Read at request time so MESSAGE_MAX_LENGTH can change without a restart in tests.
        max_length = settings.MESSAGE_MAX_LENGTH
        if len(value) > max_length:
            raise serializers.ValidationError(
                f"A mensagem é longa demais: o limite é de {max_length} caracteres."
            )
        return value


class ExchangeSerializer(serializers.Serializer):
    user_message = MessageSerializer()
    assistant_message = MessageSerializer()
