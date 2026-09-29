from django.contrib import admin

from .models import Conversation, Memory, Message

MESSAGE_FIELDS = [
    "seq",
    "role",
    "content",
    "model",
    "prompt_tokens",
    "completion_tokens",
    "finish_reason",
    "created_at",
]


class MessageInline(admin.TabularInline):
    """Read-only transcript: messages are an audit record, created only by the app."""

    model = Message
    fields = MESSAGE_FIELDS
    readonly_fields = MESSAGE_FIELDS
    ordering = ["seq"]
    extra = 0
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "title", "status", "updated_at", "deleted_at"]
    list_filter = ["status", "user"]
    list_select_related = ["user"]
    search_fields = ["user__email"]
    # Managed by the RealocAI integration and by memory extraction.
    readonly_fields = [
        "id",
        "external_conversation_id",
        "memory_extracted_seq",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = ["user"]
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "seq", "role", "model", "created_at"]
    list_filter = ["role", "conversation__user"]
    list_select_related = ["conversation"]
    search_fields = ["conversation__user__email"]
    # Content is kept as an audit record: it cannot be edited through the admin.
    readonly_fields = ["id", "conversation", "seq", "role", "content", "created_at"]

    def has_add_permission(self, request):
        # Messages must be created via chat.services.append_message (atomic seq).
        return False


@admin.register(Memory)
class MemoryAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "kind", "importance", "is_active", "expires_at", "created_at"]
    list_filter = ["kind", "is_active", "user"]
    list_select_related = ["user"]
    search_fields = ["user__email"]
    readonly_fields = ["id", "created_at", "updated_at", "last_used_at"]
    raw_id_fields = ["user", "source_message"]
