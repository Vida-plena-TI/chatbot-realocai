"""Uniform error body for the whole API: {"detail": "<message in Portuguese>"}.

DRF returns several shapes ({"detail": ...}, {"field": ["..."]}, ["..."]); the SPA only
reads `detail`, so every error is flattened to its first message.
"""

import math

from django.http import JsonResponse
from rest_framework import exceptions

NOT_AUTHENTICATED = "Não autenticado."
CSRF_FAILED = "Falha na verificação de segurança (CSRF). Recarregue a página e tente novamente."
INVALID_REQUEST = "Requisição inválida."
# The JSON parser message is in English and echoes parsing details.
MALFORMED_REQUEST = "Requisição malformada."


def exception_handler(exc, context):
    # Imported here: rest_framework.views loads the authentication classes, which
    # import this module (circular import at startup).
    from rest_framework.views import exception_handler as drf_exception_handler

    response = drf_exception_handler(exc, context)
    if response is None:
        # Unhandled exceptions stay with Django (500 + error logging).
        return None
    response.data = {"detail": _message_for(exc, response.data)}
    return response


def _message_for(exc, data):
    if isinstance(exc, exceptions.NotAuthenticated):
        return NOT_AUTHENTICATED
    if isinstance(exc, exceptions.ParseError):
        return MALFORMED_REQUEST
    if isinstance(exc, exceptions.Throttled):
        if exc.wait is None:
            return "Muitas requisições em pouco tempo. Aguarde e tente novamente."
        seconds = max(1, math.ceil(exc.wait))
        return f"Muitas requisições em pouco tempo. Tente novamente em {seconds} s."
    return _first_message(data) or INVALID_REQUEST


def _first_message(data):
    if isinstance(data, dict):
        if "detail" in data:
            return _first_message(data["detail"])
        data = list(data.values())
    if isinstance(data, list | tuple):
        for item in data:
            message = _first_message(item)
            if message:
                return message
        return None
    return str(data) if data is not None else None


def csrf_failure(request, reason=""):
    """CSRF_FAILURE_VIEW: views protected by Django's middleware/decorator (e.g. login).

    The `reason` is deliberately not exposed.
    """
    return JsonResponse({"detail": CSRF_FAILED}, status=403)
