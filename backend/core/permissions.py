from django.conf import settings
from rest_framework.permissions import BasePermission


class IsStaffOrDebug(BasePermission):
    """Open when DEBUG is on; otherwise restricted to staff users.

    Used for the OpenAPI schema and Swagger UI. DEBUG is read per request (not at
    import time) because drf-spectacular binds SERVE_PERMISSIONS when it is imported.
    """

    def has_permission(self, request, view):
        if settings.DEBUG:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)
