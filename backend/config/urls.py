from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_patterns = [
    path("", include("core.urls")),
    path("auth/", include("accounts.urls")),
    path("", include("chat.urls")),
    path("reports/", include("reports.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),
    path("api/", include(api_patterns)),
]
