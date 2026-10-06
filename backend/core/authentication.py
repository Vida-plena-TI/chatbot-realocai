from rest_framework import authentication, exceptions

from .exceptions import CSRF_FAILED


class SessionAuthentication(authentication.SessionAuthentication):
    """Session auth that answers anonymous requests with 401 instead of 403.

    DRF only returns 401 when the authenticator provides a `WWW-Authenticate` value;
    the stock SessionAuthentication does not, so every anonymous request would be a
    403. A distinct 401 lets the SPA tell "not logged in" apart from "forbidden".
    """

    def authenticate_header(self, request):
        return "Session"

    def enforce_csrf(self, request):
        # DRF's message is in English and includes the failure reason.
        try:
            super().enforce_csrf(request)
        except exceptions.PermissionDenied:
            raise exceptions.PermissionDenied(CSRF_FAILED) from None
