"""Public representations of the chat models.

Internal fields (external_conversation_id, summary, metadata, token counts) are
deliberately left out: only what the frontend needs is exposed.
"""

from rest_framework import serializers

from .models import Conversation, Message

# Upper bound for a single user message sent to the agent.
MESSAGE_MAX_LENGTH = 5000


class ConversationSerializer(serializers.ModelSerializer):
    """Read and PATCH representation: only `title` and `status` are writable."""

    class Meta:
        model = Conversation
        fields = ["id", "title", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class ConversationCreateSerializer(ConversationSerializer):
    """New conversations always start active."""

    class Meta(ConversationSerializer.Meta):
        read_only_fields = ["id", "status", "created_at", "updated_at"]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "seq", "role", "content", "created_at"]
        read_only_fields = fields


class MessageCreateSerializer(serializers.Serializer):
    # trim_whitespace (default) turns whitespace-only content into a blank error.
    content = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)


class ExchangeSerializer(serializers.Serializer):
    user_message = MessageSerializer()
    assistant_message = MessageSerializer()
