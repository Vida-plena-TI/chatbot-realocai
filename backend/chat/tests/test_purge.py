from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone

from chat.models import Conversation, Memory, Message
from chat.services.conversations import add_memory, record_exchange

pytestmark = pytest.mark.django_db

OLD = timezone.now() - timedelta(days=400)
RECENT = timezone.now() - timedelta(days=10)


def make(user, title, *, status="active", updated_at=None, deleted_at=None):
    conversation = Conversation.objects.create(user=user, title=title, status=status)
    record_exchange(conversation, "Pergunta fictícia", "Resposta fictícia")
    # QuerySet.update() bypasses auto_now.
    Conversation.objects.filter(pk=conversation.pk).update(
        updated_at=updated_at or timezone.now(), deleted_at=deleted_at
    )
    return conversation


@pytest.fixture
def conversations(user):
    return {
        "old_deleted": make(user, "a", deleted_at=OLD, updated_at=OLD),
        "recently_deleted": make(user, "b", deleted_at=RECENT, updated_at=OLD),
        "old_archived": make(user, "c", status="archived", updated_at=OLD),
        "recently_archived": make(user, "d", status="archived", updated_at=RECENT),
        "old_active": make(user, "e", updated_at=OLD),
    }


def run(*args):
    out = StringIO()
    call_command("purge_old_conversations", *args, stdout=out)
    return out.getvalue()


def remaining_titles():
    return set(Conversation.objects.values_list("title", flat=True))


def test_without_days_does_nothing(conversations):
    output = run()

    assert "Nada foi feito" in output
    assert len(remaining_titles()) == 5


def test_dry_run_only_counts(conversations):
    output = run("--days", "365", "--dry-run")

    assert "2 conversa(s)" in output
    assert "1 apagada(s), 1 arquivada(s)" in output
    assert "4 mensagem(ns)" in output
    assert len(remaining_titles()) == 5


def test_deletes_old_deleted_and_old_archived_only(conversations, user):
    memory = add_memory(
        user, "fact", "Fato fictício.", source_message=conversations["old_deleted"].messages.first()
    )

    output = run("--days", "365")

    assert remaining_titles() == {"b", "d", "e"}
    assert "Apagadas: 2 conversa(s)" in output
    assert Message.objects.filter(conversation__title__in=["a", "c"]).count() == 0
    # Memories outlive their source message.
    memory.refresh_from_db()
    assert memory.source_message is None
    assert Memory.objects.count() == 1


def test_output_never_contains_contents(conversations):
    output = run("--days", "1")

    assert "fictícia" not in output


@pytest.mark.parametrize("days", ["0", "-5"])
def test_rejects_non_positive_days(conversations, days):
    with pytest.raises(CommandError):
        run("--days", days)

    assert len(remaining_titles()) == 5
