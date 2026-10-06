from django.conf import settings
from django.contrib import admin

from .models import Conversation, Memory, Message

# Messages are an audit record: every field is read-only. Contents (text and report
# blocks) are health data and are only shown with ADMIN_SHOW_MESSAGE_CONTENT=true.
MESSAGE_META_FIELDS = ["seq", "role", "created_at", "size"]
MESSAGE_CONTENT_FIELDS = ["content", "blocos"]
MESSAGE_MODEL_FIELDS = ["model", "prompt_tokens", "completion_tokens", "finish_reason"]


def show_message_content():
    # Read on each request, so the setting can be toggled without code changes.
    return settings.ADMIN_SHOW_MESSAGE_CONTENT


def message_fields():
    content = MESSAGE_CONTENT_FIELDS if show_message_content() else []
    return [*MESSAGE_META_FIELDS, *content, *MESSAGE_MODEL_FIELDS]


@admin.display(description="tamanho")
def message_size(obj):
    size = f"{len(obj.content)} caracteres"
    if obj.blocos:
        size += f", {len(obj.blocos)} bloco(s) de relatório"
    return size


class MessageInline(admin.TabularInline):
    """Read-only transcript: messages are an audit record, created only by the app."""

    model = Message
    ordering = ["seq"]
    extra = 0
    can_delete = False
    show_change_link = True

    def size(self, obj):
        return message_size(obj)

    size.short_description = "tamanho"

    def get_fields(self, request, obj=None):
        return message_fields()

    def get_readonly_fields(self, request, obj=None):
        return message_fields()

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "title", "status", "updated_at", "deleted_at"]
    list_filter = ["status", "user"]
    list_select_related = ["user"]
    search_fields = ["user__email"]
    # Managed by the RealocAI integration, the chat turns and memory extraction.
    readonly_fields = [
        "id",
        "external_conversation_id",
        "memory_extracted_seq",
        "preview",
        "processing_started_at",
        "created_at",
        "updated_at",
    ]
    raw_id_fields = ["user"]
    inlines = [MessageInline]

    def get_exclude(self, request, obj=None):
        # The preview is an excerpt of the last answer: content, like the messages.
        return [] if show_message_content() else ["preview"]

    def get_readonly_fields(self, request, obj=None):
        hidden = self.get_exclude(request, obj)
        return [f for f in self.readonly_fields if f not in hidden]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "seq", "role", "model", "created_at"]
    list_filter = ["role", "conversation__user"]
    list_select_related = ["conversation"]
    search_fields = ["conversation__user__email"]

    def size(self, obj):
        return message_size(obj)

    size.short_description = "tamanho"

    def get_fields(self, request, obj=None):
        return ["id", "conversation", *message_fields()]

    def get_readonly_fields(self, request, obj=None):
        # Everything: content is kept as an audit record and cannot be edited.
        return self.get_fields(request, obj)

    def has_add_permission(self, request):
        # Messages must be created via chat.services (atomic seq).
        return False


@admin.register(Memory)
class MemoryAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "kind", "importance", "is_active", "expires_at", "created_at"]
    list_filter = ["kind", "is_active", "user"]
    list_select_related = ["user"]
    search_fields = ["user__email"]
    readonly_fields = ["id", "created_at", "updated_at", "last_used_at"]
    raw_id_fields = ["user", "source_message"]
