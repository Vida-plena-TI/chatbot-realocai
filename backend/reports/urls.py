from django.urls import path

from .views import ReportExportView

app_name = "reports"

urlpatterns = [
    path("export/", ReportExportView.as_view(), name="export"),
]
