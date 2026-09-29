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


REALOCAI_BASE_URL = "http://realocai.test"
REALOCAI_CHAT_URL = f"{REALOCAI_BASE_URL}/agenda/chat"
# Fake key, used to assert it never leaks into responses or logs.
REALOCAI_API_KEY = "fake-realocai-key-5f2c9e"


@pytest.fixture(autouse=True)
def _realocai_settings(settings):
    # Never point tests at a real RealocAI instance.
    settings.REALOCAI_BASE_URL = REALOCAI_BASE_URL
    settings.REALOCAI_API_KEY = REALOCAI_API_KEY
    settings.REALOCAI_TIMEOUT_SECONDS = 5
