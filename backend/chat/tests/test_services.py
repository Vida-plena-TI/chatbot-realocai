import threading
from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone

from chat.models import Conversation, Memory, Message
from chat.services.conversations import (
    add_memory,
    append_message,
    create_conversation,
    deactivate_memory,
    get_active_memories,
    get_context_messages,
    soft_delete_conversation,
)


@pytest.mark.django_db
def test_create_conversation(user):
    conversation = create_conversation(user, title="Agenda da semana")

    assert conversation.user == user
    assert conversation.title == "Agenda da semana"
    assert conversation.status == Conversation.Status.ACTIVE


@pytest.mark.django_db
def test_create_conversation_title_is_optional(user):
    assert create_conversation(user).title == ""


@pytest.mark.django_db
def test_append_message_increments_seq_by_one(conversation):
    messages = [append_message(conversation, "user", f"Mensagem {i}") for i in range(5)]

    assert [m.seq for m in messages] == [1, 2, 3, 4, 5]


@pytest.mark.django_db
def test_append_message_seq_is_per_conversation(user, conversation):
    other = create_conversation(user)
    append_message(conversation, "user", "A1")
    append_message(conversation, "assistant", "A2")

    assert append_message(other, "user", "B1").seq == 1


@pytest.mark.django_db
def test_append_message_stores_extra_fields(conversation):
    message = append_message(
        conversation,
        "assistant",
        "Resposta",
        model="modelo-ficticio",
        prompt_tokens=10,
        completion_tokens=5,
        finish_reason="stop",
        metadata={"tool_calls": []},
    )

    message.refresh_from_db()
    assert message.model == "modelo-ficticio"
    assert message.prompt_tokens == 10
    assert message.completion_tokens == 5
    assert message.finish_reason == "stop"
    assert message.metadata == {"tool_calls": []}


@pytest.mark.django_db
def test_append_message_touches_conversation_updated_at(conversation):
    before = conversation.updated_at

    append_message(conversation, "user", "Oi")

    conversation.refresh_from_db()
    assert conversation.updated_at > before


@pytest.mark.django_db
def test_append_message_rejects_invalid_role(conversation):
    with pytest.raises(ValueError, match="Invalid message role"):
        append_message(conversation, "admin", "Oi")
    assert not conversation.messages.exists()


@pytest.mark.django_db(transaction=True)
def test_concurrent_append_message_never_duplicates_seq(conversation):
    threads_count, per_thread = 5, 4
    barrier = threading.Barrier(threads_count)
    errors = []

    def worker(n):
        try:
            barrier.wait()
            for i in range(per_thread):
                append_message(conversation, "user", f"Thread {n} mensagem {i}")
        except Exception as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)
        finally:
            # Each thread has its own DB connection; release it.
            connection.close()

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(threads_count)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    seqs = list(Message.objects.filter(conversation=conversation).values_list("seq", flat=True))
    assert seqs == list(range(1, threads_count * per_thread + 1))


@pytest.mark.django_db
def test_get_context_messages_returns_all_in_chronological_order(conversation):
    append_message(conversation, "user", "Pergunta")
    append_message(conversation, "assistant", "Resposta")

    assert get_context_messages(conversation) == [
        {"role": "user", "content": "Pergunta"},
        {"role": "assistant", "content": "Resposta"},
    ]


@pytest.mark.django_db
def test_get_context_messages_respects_limit_keeping_the_latest(conversation):
    for i in range(1, 6):
        append_message(conversation, "user", f"m{i}")

    context = get_context_messages(conversation, limit=3)

    assert [m["content"] for m in context] == ["m3", "m4", "m5"]


@pytest.mark.django_db
def test_get_context_messages_empty_conversation(conversation):
    assert get_context_messages(conversation, limit=10) == []


@pytest.mark.django_db
def test_soft_delete_keeps_conversation_and_messages(conversation):
    append_message(conversation, "user", "Oi")
    append_message(conversation, "assistant", "Olá")

    soft_delete_conversation(conversation)

    conversation.refresh_from_db()
    assert conversation.deleted_at is not None
    assert Message.objects.filter(conversation=conversation).count() == 2


@pytest.mark.django_db
def test_soft_delete_is_idempotent(conversation):
    soft_delete_conversation(conversation)
    first = conversation.deleted_at

    soft_delete_conversation(conversation)

    conversation.refresh_from_db()
    assert conversation.deleted_at == first


@pytest.mark.django_db
def test_add_memory(user, conversation):
    source = append_message(conversation, "user", "Prefiro atendimento pela manhã")

    memory = add_memory(user, "preference", "Prefere manhã", source_message=source, importance=4)

    assert memory.pk is not None
    assert memory.source_message == source
    assert memory.importance == 4
    assert memory.is_active


@pytest.mark.django_db
def test_add_memory_defaults_importance_to_3(user):
    assert add_memory(user, "fact", "Fato fictício").importance == 3


@pytest.mark.django_db
@pytest.mark.parametrize(("kind", "importance"), [("fact", 0), ("fact", 6), ("opinion", 3)])
def test_add_memory_validates_kind_and_importance(user, kind, importance):
    with pytest.raises(ValidationError):
        add_memory(user, kind, "Conteúdo", importance=importance)
    assert not Memory.objects.exists()


@pytest.mark.django_db
def test_deactivate_memory_keeps_the_row(user):
    memory = add_memory(user, "fact", "Fato fictício")

    deactivate_memory(memory)

    memory.refresh_from_db()
    assert not memory.is_active


@pytest.mark.django_db
def test_get_active_memories_filters_and_orders(user, other_user):
    now = timezone.now()
    low = add_memory(user, "fact", "baixa", importance=1)
    high_old = add_memory(user, "fact", "alta antiga", importance=5)
    high_new = add_memory(user, "fact", "alta nova", importance=5)
    # Pin created_at so the tie-break does not depend on clock resolution.
    Memory.objects.filter(pk=high_old.pk).update(created_at=now - timedelta(hours=1))
    future = add_memory(user, "fact", "expira depois", importance=3)
    future.expires_at = now + timedelta(days=1)
    future.save()

    inactive = add_memory(user, "fact", "inativa", importance=5)
    deactivate_memory(inactive)
    expired = add_memory(user, "fact", "expirada", importance=5)
    expired.expires_at = now - timedelta(minutes=1)
    expired.save()
    add_memory(other_user, "fact", "de outro usuário", importance=5)

    assert list(get_active_memories(user)) == [high_new, high_old, future, low]


@pytest.mark.django_db
def test_get_active_memories_respects_limit(user):
    for i in range(5):
        add_memory(user, "fact", f"fato {i}")

    assert len(get_active_memories(user, limit=2)) == 2
