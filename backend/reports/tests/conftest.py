import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        email="profissional@exemplo.com", password="senha-forte-123"
    )


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client
