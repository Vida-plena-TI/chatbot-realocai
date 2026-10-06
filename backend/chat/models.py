import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Conversation(models.Model):
    """A chat thread owned by a single user."""

    class Status(models.TextChoices):
        ACTIVE = "active", "ativa"
        ARCHIVED = "archived", "arquivada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations",
        verbose_name="usuário",
    )
    title = models.CharField("título", max_length=200, blank=True)
    status = models.CharField("status", max_length=20, choices=Status, default=Status.ACTIVE)
    # Incremental summary used to fit long conversations into the LLM context window.
    # Internal (memory extraction / context injection): never exposed by the API.
    summary = models.TextField("resumo", blank=True)
    # One-line excerpt of the last assistant answer, shown in the sidebar. Exposed by
    # the API as `summary` (see chat.services.content.summarize).
    preview = models.CharField("prévia", max_length=90, blank=True, default="")
    metadata = models.JSONField("metadados", default=dict, blank=True)
    # `conversa_id` of the matching conversation in the RealocAI service. Empty until
    # the first exchange; internal only, never exposed to the frontend.
    external_conversation_id = models.CharField(
        "ID da conversa no RealocAI", max_length=64, blank=True, default="", db_index=True
    )
    # Highest Message.seq already processed by memory extraction.
    memory_extracted_seq = models.PositiveIntegerField(
        "última sequência processada para memória", default=0
    )
    created_at = models.DateTimeField("criada em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizada em", auto_now=True)
    # Soft delete: set instead of removing the row.
    deleted_at = models.DateTimeField("apagada em", null=True, blank=True)
    # Set while a chat turn is in flight (claimed by an atomic conditional UPDATE), so
    # a second concurrent message gets a 409 instead of opening another RealocAI
    # conversation. Stale claims expire (see chat.services.agent).
    processing_started_at = models.DateTimeField("processamento iniciado em", null=True, blank=True)

    class Meta:
        verbose_name = "conversa"
        verbose_name_plural = "conversas"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["user", "-updated_at"], name="chat_conv_user_updated_idx"),
        ]

    def __str__(self):
        return self.title or str(self.id)


class Message(models.Model):
    """A single turn in a conversation, ordered by `seq`."""

    class Role(models.TextChoices):
        SYSTEM = "system", "sistema"
        USER = "user", "usuário"
        ASSISTANT = "assistant", "assistente"
        TOOL = "tool", "ferramenta"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name="conversa",
    )
    # Position inside the conversation; assigned by chat.services.append_message.
    seq = models.PositiveIntegerField("sequência")
    role = models.CharField("papel", max_length=20, choices=Role)
    content = models.TextField("conteúdo")
    # Name of the model that generated the response (assistant messages only).
    model = models.CharField("modelo", max_length=100, blank=True)
    prompt_tokens = models.PositiveIntegerField("tokens do prompt", null=True, blank=True)
    completion_tokens = models.PositiveIntegerField("tokens da resposta", null=True, blank=True)
    finish_reason = models.CharField("motivo de término", max_length=50, blank=True)
    # Reserved for tool calls and similar LLM details.
    metadata = models.JSONField("metadados", default=dict, blank=True)
    # Report blocks sent by RealocAI with an assistant answer, stored as opaque JSON
    # (a list of objects with at least "tipo" and "versao"). Empty for most messages.
    blocos = models.JSONField("blocos de relatório", default=list, blank=True)
    created_at = models.DateTimeField("criada em", auto_now_add=True)

    class Meta:
        verbose_name = "mensagem"
        verbose_name_plural = "mensagens"
        ordering = ["seq"]
        constraints = [
            models.UniqueConstraint(
                fields=["conversation", "seq"], name="chat_message_unique_conversation_seq"
            ),
        ]

    def __str__(self):
        return f"{self.conversation_id} #{self.seq} ({self.role})"


class Memory(models.Model):
    """Long-term information about a user, carried across conversations."""

    class Kind(models.TextChoices):
        FACT = "fact", "fato"
        PREFERENCE = "preference", "preferência"
        SUMMARY = "summary", "resumo"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memories",
        verbose_name="usuário",
    )
    kind = models.CharField("tipo", max_length=20, choices=Kind)
    content = models.TextField("conteúdo")
    source_message = models.ForeignKey(
        Message,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="memories",
        verbose_name="mensagem de origem",
    )
    importance = models.SmallIntegerField(
        "importância",
        default=3,
        validators=[MinValueValidator(1), MaxValueValidator(5)],
    )
    # Deactivate instead of deleting, to keep an audit trail.
    is_active = models.BooleanField("ativa", default=True)
    last_used_at = models.DateTimeField("usada por último em", null=True, blank=True)
    expires_at = models.DateTimeField("expira em", null=True, blank=True)
    created_at = models.DateTimeField("criada em", auto_now_add=True)
    updated_at = models.DateTimeField("atualizada em", auto_now=True)

    class Meta:
        verbose_name = "memória"
        verbose_name_plural = "memórias"
        ordering = ["-importance", "-created_at"]
        indexes = [
            models.Index(
                fields=["user", "is_active", "-importance"], name="chat_mem_user_active_imp_idx"
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} ({self.user_id})"
