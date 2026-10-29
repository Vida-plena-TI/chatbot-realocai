import pytest
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient

from chat.services.sensitive import PATIENT_REPORTS_GROUP


@pytest.fixture
def user(db):
    """In the patient reports group: these tests are about the spreadsheet, and several
    use `agenda_paciente`. Access is covered in test_patient_reports.py."""
    user = get_user_model().objects.create_user(
        email="profissional@exemplo.com", password="senha-forte-123"
    )
    user.groups.add(Group.objects.get_or_create(name=PATIENT_REPORTS_GROUP)[0])
    return user


@pytest.fixture
def api(user):
    client = APIClient()
    client.force_login(user)
    return client
