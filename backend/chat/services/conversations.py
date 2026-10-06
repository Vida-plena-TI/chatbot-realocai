"""Domain operations on conversations, messages and memories.

Views and the LLM integration should go through these functions instead of
writing to the models directly, so invariants (e.g. `Message.seq`) hold.
"""

from django.db import transaction
from django.db.models import Max, Q
from django.utils import timezone

from chat.models import Conversation, Memory, Message
from chat.services.content import summarize, title_from


def create_conversation(user, title=""):
    return Conversation.objects.create(user=user, title=title)


def append_message(conversation, role, content, **extra):
    """Append a message with the next `seq` of the conversation.

    The conversation row is locked (SELECT ... FOR UPDATE) for the duration of the
    transaction, so concurrent calls on the same conversation are serialized and
    never compute the same `seq`. `extra` accepts the other Message fields
    (model, prompt_tokens, completion_tokens, finish_reason, metadata).
    """
    if role not in Message.Role.values:
        raise ValueError(f"Invalid message role: {role!r}")

    with transaction.atomic():
        locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
        last_seq = locked.messages.aggregate(last=Max("seq"))["last"] or 0
        message = Message.objects.create(
            conversation=locked, seq=last_seq + 1, role=role, content=content, **extra
        )
        # auto_now refreshes updated_at on save.
        locked.save(update_fields=["updated_at"])

    conversation.updated_at = locked.updated_at
    return message


def record_exchange(
    conversation, user_content, assistant_content, *, blocos=None, external_conversation_id=None
):
    """Store a user message and its answer, with consecutive `seq`s, in one transaction.

    Nothing is written unless both messages are. The same transaction refreshes the
    sidebar preview, sets an automatic title when the conversation has none and, when
    given, stores the RealocAI `conversa_id`. Returns (user_message, assistant_message).
    The row lock only lasts for these few writes (never during a call to the agent).
    """
    with transaction.atomic():
        locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
        last_seq = locked.messages.aggregate(last=Max("seq"))["last"] or 0
        user_message = Message.objects.create(
            conversation=locked, seq=last_seq + 1, role=Message.Role.USER, content=user_content
        )
        assistant_message = Message.objects.create(
            conversation=locked,
            seq=last_seq + 2,
            role=Message.Role.ASSISTANT,
            content=assistant_content,
            blocos=blocos or [],
        )
        locked.preview = summarize(assistant_content)
        update_fields = ["preview", "updated_at"]
        if not locked.title.strip():
            locked.title = title_from(user_content)
            update_fields.append("title")
        if external_conversation_id is not None:
            locked.external_conversation_id = external_conversation_id
            update_fields.append("external_conversation_id")
        locked.save(update_fields=update_fields)

    for field in ("preview", "title", "external_conversation_id", "updated_at"):
        setattr(conversation, field, getattr(locked, field))
    return user_message, assistant_message


def get_context_messages(conversation, limit=None):
    """Return the last `limit` messages (all if None) as [{role, content}], oldest first."""
    messages = conversation.messages.order_by("-seq")
    if limit is not None:
        messages = messages[:limit]
    rows = list(messages.values("role", "content"))
    rows.reverse()
    return rows


def soft_delete_conversation(conversation):
    """Mark the conversation as deleted; its messages are kept."""
    if conversation.deleted_at is None:
        conversation.deleted_at = timezone.now()
        conversation.save(update_fields=["deleted_at", "updated_at"])
    return conversation


def add_memory(user, kind, content, source_message=None, importance=3):
    memory = Memory(
        user=user,
        kind=kind,
        content=content,
        source_message=source_message,
        importance=importance,
    )
    # Enforce the kind choices and the 1-5 importance range, which save() skips.
    memory.full_clean()
    memory.save()
    return memory


def deactivate_memory(memory):
    if memory.is_active:
        memory.is_active = False
        memory.save(update_fields=["is_active", "updated_at"])
    return memory


def get_active_memories(user, limit=20):
    """Active, non-expired memories of the user, most important and newest first."""
    now = timezone.now()
    return (
        Memory.objects.filter(user=user, is_active=True)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .order_by("-importance", "-created_at")[:limit]
    )
