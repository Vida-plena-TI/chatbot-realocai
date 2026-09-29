from drf_spectacular.authentication import SessionScheme as BaseSessionScheme


class SessionScheme(BaseSessionScheme):
    """Documents core.authentication.SessionAuthentication as cookie auth in OpenAPI."""

    target_class = "core.authentication.SessionAuthentication"
