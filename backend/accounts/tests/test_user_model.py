import pytest
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_create_user_with_email():
    user = User.objects.create_user(
        email="Paciente@Exemplo.COM", password="senha-forte-123", full_name="Ana Souza"
    )

    assert user.email == "Paciente@exemplo.com"  # domain is normalized
    assert user.full_name == "Ana Souza"
    assert user.check_password("senha-forte-123")
    assert user.is_active
    assert not user.is_staff
    assert not user.is_superuser
    assert user.created_at is not None
    assert not hasattr(user, "username")


@pytest.mark.django_db
@pytest.mark.parametrize("email", ["", None])
def test_create_user_without_email_fails(email):
    with pytest.raises(ValueError, match="e-mail é obrigatório"):
        User.objects.create_user(email=email, password="senha-forte-123")


@pytest.mark.django_db
def test_create_superuser():
    admin = User.objects.create_superuser(email="admin@exemplo.com", password="senha-forte-123")

    assert admin.is_staff
    assert admin.is_superuser
