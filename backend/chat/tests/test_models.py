import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from chat.models import Conversation, Memory, Message


@pytest.mark.django_db
def test_conversation_defaults(conversation):
    assert conversation.status == Conversation.Status.ACTIVE
    assert conversation.summary == ""
    assert conversation.metadata == {}
    assert conversation.deleted_at is None


@pytest.mark.django_db
def test_message_seq_is_unique_per_conversation(conversation, user):
    Message.objects.create(conversation=conversation, seq=1, role="user", content="Olá")

    with pytest.raises(IntegrityError), transaction.atomic():
        Message.objects.create(conversation=conversation, seq=1, role="user", content="De novo")

    # The same seq is fine in another conversation.
    other = Conversation.objects.create(user=user)
    Message.objects.create(conversation=other, seq=1, role="user", content="Olá")


@pytest.mark.django_db
def test_messages_are_ordered_by_seq(conversation):
    for seq in (3, 1, 2):
        Message.objects.create(conversation=conversation, seq=seq, role="user", content=str(seq))

    assert [m.seq for m in conversation.messages.all()] == [1, 2, 3]


@pytest.mark.django_db
@pytest.mark.parametrize("importance", [0, 6])
def test_memory_importance_must_be_between_1_and_5(user, importance):
    memory = Memory(
        user=user, kind="fact", content="Prefere respostas curtas", importance=importance
    )

    with pytest.raises(ValidationError) as exc:
        memory.full_clean()
    assert "importance" in exc.value.message_dict


@pytest.mark.django_db
def test_deleting_user_cascades_to_conversations_messages_and_memories(user, other_user):
    conversation = Conversation.objects.create(user=user)
    message = Message.objects.create(conversation=conversation, seq=1, role="user", content="Oi")
    Memory.objects.create(user=user, kind="fact", content="Fato fictício", source_message=message)
    kept = Conversation.objects.create(user=other_user)

    user.delete()

    assert list(Conversation.objects.all()) == [kept]
    assert not Message.objects.exists()
    assert not Memory.objects.exists()


@pytest.mark.django_db
def test_deleting_source_message_keeps_memory(conversation, user):
    message = Message.objects.create(conversation=conversation, seq=1, role="user", content="Oi")
    memory = Memory.objects.create(
        user=user, kind="preference", content="Prefere e-mail", source_message=message
    )

    message.delete()

    memory.refresh_from_db()
    assert memory.source_message is None
