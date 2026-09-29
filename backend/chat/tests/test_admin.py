import pytest
from django.contrib.admin.sites import site
from django.contrib.auth import get_user_model
from django.urls import reverse

from chat.models import Memory, Message
from chat.services.conversations import add_memory, append_message


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


@pytest.mark.django_db
def test_conversation_change_page_shows_read_only_messages(admin_client, conversation, message):
    response = admin_client.get(reverse("admin:chat_conversation_change", args=[conversation.pk]))

    assert response.status_code == 200
    assert "Mensagem fictícia" in response.content.decode()


@pytest.mark.django_db
def test_message_content_is_read_only(admin_client, message):
    url = reverse("admin:chat_message_change", args=[message.pk])

    admin_client.post(url, {"content": "Alterado", "model": "", "finish_reason": ""})

    message.refresh_from_db()
    assert message.content == "Mensagem fictícia"


def test_message_cannot_be_added_via_admin(rf):
    assert not site._registry[Message].has_add_permission(rf.get("/"))


def test_memory_is_editable_via_admin():
    assert "content" not in site._registry[Memory].readonly_fields
