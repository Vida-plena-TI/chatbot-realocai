from rest_framework import authentication


class SessionAuthentication(authentication.SessionAuthentication):
    """Session auth that answers anonymous requests with 401 instead of 403.

    DRF only returns 401 when the authenticator provides a `WWW-Authenticate` value;
    the stock SessionAuthentication does not, so every anonymous request would be a
    403. A distinct 401 lets the SPA tell "not logged in" apart from "forbidden".
    """

    def authenticate_header(self, request):
        return "Session"
