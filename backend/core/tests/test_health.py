from django.urls import reverse
from rest_framework.test import APIClient


def test_health_check_returns_ok_without_authentication():
    response = APIClient().get(reverse("core:health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
