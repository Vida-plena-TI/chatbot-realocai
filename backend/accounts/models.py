from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    """User authenticated by email instead of username."""

    email = models.EmailField("e-mail", unique=True)
    full_name = models.CharField("nome completo", max_length=255, blank=True)
    is_active = models.BooleanField("ativo", default=True)
    is_staff = models.BooleanField("membro da equipe", default=False)
    created_at = models.DateTimeField("criado em", auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = "usuário"
        verbose_name_plural = "usuários"
        ordering = ["-created_at"]

    def __str__(self):
        return self.email

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        return self.full_name.split(" ")[0] if self.full_name else self.email
