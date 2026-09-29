import json
from types import SimpleNamespace

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


# Fake key, used to assert it never leaks into logs.
OPENAI_API_KEY = "sk-fake-openai-key-8d41b0"


@pytest.fixture(autouse=True)
def _openai_settings(settings):
    # Extraction is off unless a test opts in with `fake_openai`.
    settings.OPENAI_API_KEY = ""
    settings.OPENAI_EXTRACTION_MODEL = "gpt-test-model"
    settings.REALOCAI_INJECT_MEMORIES = False


class FakeOpenAI:
    """Stands in for the OpenAI client: records calls and returns a canned output."""

    def __init__(self):
        self.calls = []
        self.output = {"memories": [], "summary": ""}
        self.error = None
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        content = self.output if isinstance(self.output, str) else json.dumps(self.output)
        message = SimpleNamespace(content=content, refusal=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture
def fake_openai(settings, monkeypatch):
    # Never call the real OpenAI API from tests.
    from chat.services import memory_extraction

    settings.OPENAI_API_KEY = OPENAI_API_KEY
    fake = FakeOpenAI()
    monkeypatch.setattr(memory_extraction, "_get_client", lambda: fake)
    return fake
