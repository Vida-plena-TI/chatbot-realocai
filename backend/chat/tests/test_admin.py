import pytest
from django.contrib.admin.sites import site
from django.contrib.auth import get_user_model
from django.urls import reverse

from chat.models import Memory, Message
from chat.services.conversations import add_memory, append_message, record_exchange


@pytest.fixture
def admin_client(client, db):
    admin = get_user_model().objects.create_superuser(
        email="admin@exemplo.com", password="senha-forte-123"
    )
    client.force_login(admin)
    return client


@pytest.fixture
def message(conversation):
    return append_message(conversation, "user", "Mensagem fictícia")


@pytest.mark.django_db
@pytest.mark.parametrize("model", ["conversation", "message", "memory"])
def test_changelist_loads_with_search_and_filters(admin_client, message, user, model):
    add_memory(user, "fact", "Fato fictício", source_message=message)
    url = reverse(f"admin:chat_{model}_changelist")

    assert admin_client.get(url).status_code == 200
    assert admin_client.get(url, {"q": user.email}).status_code == 200


@pytest.fixture
def answered(conversation):
    _, answer = record_exchange(
        conversation,
        "Pergunta fictícia",
        "Resposta fictícia com prévia",
        blocos=[{"tipo": "x", "versao": 1, "titulo": "Bloco fictício"}],
    )
    return answer


def admin_pages(admin_client, conversation, answer):
    return [
        admin_client.get(reverse("admin:chat_conversation_change", args=[conversation.pk])),
        admin_client.get(reverse("admin:chat_message_change", args=[answer.pk])),
    ]


@pytest.mark.django_db
def test_message_contents_are_hidden_by_default(admin_client, conversation, answered, settings):
    settings.ADMIN_SHOW_MESSAGE_CONTENT = False

    for response in admin_pages(admin_client, conversation, answered):
        html = response.content.decode()
        assert response.status_code == 200
        for text in ("Pergunta fictícia", "Resposta fictícia", "Bloco fictício"):
            assert text not in html
        # Metadata is still shown.
        assert "28 caracteres, 1 bloco(s) de relatório" in html


@pytest.mark.django_db
def test_message_contents_are_shown_when_enabled(admin_client, conversation, answered, settings):
    settings.ADMIN_SHOW_MESSAGE_CONTENT = True

    conversation_page, message_page = admin_pages(admin_client, conversation, answered)

    assert "Pergunta fictícia" in conversation_page.content.decode()
    assert "Resposta fictícia com prévia" in message_page.content.decode()
    assert "Bloco fictício" in message_page.content.decode()


@pytest.mark.django_db
def test_message_content_is_read_only(admin_client, message, settings):
    settings.ADMIN_SHOW_MESSAGE_CONTENT = True
    url = reverse("admin:chat_message_change", args=[message.pk])

    admin_client.post(url, {"content": "Alterado", "model": "", "finish_reason": ""})

    message.refresh_from_db()
    assert message.content == "Mensagem fictícia"


def test_message_cannot_be_added_via_admin(rf):
    assert not site._registry[Message].has_add_permission(rf.get("/"))


def test_memory_is_editable_via_admin():
    assert "content" not in site._registry[Memory].readonly_fields
