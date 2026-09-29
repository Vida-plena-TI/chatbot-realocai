from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    """Liveness probe. Public and intentionally free of any internal details."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer("HealthCheck", fields={"status": serializers.CharField()}),
        tags=["health"],
    )
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})
