from django.contrib.auth import authenticate
from rest_framework import serializers

from .models import User

INVALID_CREDENTIALS = "Credenciais inválidas."


class LoginSerializer(serializers.Serializer):
    """Validates email/password and resolves the matching active user.

    Callers must not surface `errors` to the client: every failure (malformed input,
    unknown email, wrong password, inactive account) is reported with the same
    generic message so the response never reveals whether an email is registered.
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        request = self.context.get("request")
        user = authenticate(
            request._request if request is not None else None,
            email=attrs["email"],
            password=attrs["password"],
        )
        # ModelBackend already rejects inactive users; the check guards other backends.
        if user is None or not user.is_active:
            raise serializers.ValidationError(INVALID_CREDENTIALS)
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    """Public view of the authenticated user. Never includes the password hash."""

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "is_staff"]
        read_only_fields = fields
