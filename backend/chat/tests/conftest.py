import pytest
from django.contrib.auth import get_user_model

from chat.models import Conversation


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        email="profissional@exemplo.com", password="senha-forte-123"
    )


@pytest.fixture
def other_user(db):
    return get_user_model().objects.create_user(
        email="outra.profissional@exemplo.com", password="senha-forte-123"
    )


@pytest.fixture
def conversation(user):
    return Conversation.objects.create(user=user, title="Conversa de teste")
