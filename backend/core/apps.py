from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Registers the OpenAPI extension for the custom session authenticator.
        from . import schema  # noqa: F401
