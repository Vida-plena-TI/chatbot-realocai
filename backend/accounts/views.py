from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import INVALID_CREDENTIALS, LoginSerializer, UserSerializer

DetailSerializer = inline_serializer("Detail", fields={"detail": serializers.CharField()})


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Sets the csrftoken cookie. The SPA calls this before its first unsafe request."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses=DetailSerializer, tags=["auth"])
    def get(self, request: Request) -> Response:
        return Response({"detail": "csrf cookie set"})


# DRF exempts views from CSRF and only enforces it for authenticated sessions. Login
# is enforced explicitly too, to block login CSRF (forcing a victim into our session).
@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(
        request=LoginSerializer,
        responses={
            200: UserSerializer,
            401: OpenApiResponse(DetailSerializer, description="Credenciais inválidas."),
            429: OpenApiResponse(DetailSerializer, description="Muitas tentativas."),
        },
        tags=["auth"],
    )
    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data, context={"request": request})
        if not serializer.is_valid():
            raise AuthenticationFailed(INVALID_CREDENTIALS)
        user = serializer.validated_data["user"]
        # Rotates the session key and the CSRF token: the SPA must re-read the cookie.
        login(request._request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None}, tags=["auth"])
    def post(self, request: Request) -> Response:
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(responses=UserSerializer, tags=["auth"])
    def get(self, request: Request) -> Response:
        return Response(UserSerializer(request.user).data)
