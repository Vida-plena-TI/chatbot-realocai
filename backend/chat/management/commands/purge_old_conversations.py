"""Permanently delete old soft-deleted or archived conversations (LGPD retention).

Rule (the safest simple one):
- soft-deleted conversations whose `deleted_at` is older than N days;
- archived conversations whose last activity (`updated_at`, which archiving also
  refreshes) is older than N days.
Active conversations are never touched, however old. Messages go with their
conversation (CASCADE); memories keep existing, with `source_message` set to NULL.

Nothing is scheduled: run it by hand or from an external scheduler. Without --days
it does nothing. Only counts are printed, never contents.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from chat.models import Conversation, Message


class Command(BaseCommand):
    help = (
        "Apaga definitivamente conversas apagadas (soft delete) ou arquivadas há mais de "
        "N dias, com suas mensagens. Sem --days, não faz nada."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--days", type=int, help="Idade mínima, em dias (inteiro >= 1). Obrigatório."
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="Só mostra quantas seriam apagadas."
        )

    def handle(self, *args, days=None, dry_run=False, **options):
        if days is None:
            self.stdout.write("Nada foi feito: informe --days N (ex.: --days 365).")
            return
        if days < 1:
            raise CommandError("--days precisa ser um inteiro maior ou igual a 1.")

        cutoff = timezone.now() - timedelta(days=days)
        conversations = Conversation.objects.filter(
            Q(deleted_at__lt=cutoff)
            | Q(deleted_at__isnull=True, status=Conversation.Status.ARCHIVED, updated_at__lt=cutoff)
        )
        deleted_count = conversations.filter(deleted_at__isnull=False).count()
        archived_count = conversations.filter(deleted_at__isnull=True).count()
        messages_count = Message.objects.filter(conversation__in=conversations).count()
        summary = (
            f"{deleted_count + archived_count} conversa(s) com mais de {days} dia(s) "
            f"({deleted_count} apagada(s), {archived_count} arquivada(s)) e "
            f"{messages_count} mensagem(ns)"
        )

        if dry_run:
            self.stdout.write(f"[dry-run] Seriam apagadas: {summary}.")
            return

        with transaction.atomic():
            conversations.delete()
        self.stdout.write(self.style.SUCCESS(f"Apagadas: {summary}."))
