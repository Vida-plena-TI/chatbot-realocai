from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.views import APIView

from chat.services.sensitive import can_view_patient_reports, is_sensitive_block

from .excel import XLSX_CONTENT_TYPE, build_workbook, export_filename
from .serializers import ExportSerializer

UNSUPPORTED_FORMAT = "Formato não suportado."
INVALID_BODY = "Corpo da requisição inválido."
PATIENT_REPORTS_FORBIDDEN = "Você não tem permissão para exportar este relatório."

DetailSerializer = inline_serializer("ReportDetail", fields={"detail": serializers.CharField()})


class ExportTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "Os relatórios enviados são grandes demais para exportar."
    default_code = "too_large"


class ReportExportView(APIView):
    """Build a spreadsheet from report blocks sent by the SPA.

    Requires a session and the CSRF token, like every unsafe request. The file is
    generated only from the request body: nothing is read from the database, so no
    other user's data can end up in it. PDF is printed by the browser (v1), so the
    only supported `formato` is "excel".
    """

    parser_classes = [JSONParser]

    @extend_schema(
        request=inline_serializer(
            "ReportExportRequest",
            fields={
                "formato": serializers.ChoiceField(choices=["excel"]),
                "blocos": serializers.ListField(child=serializers.DictField()),
            },
        ),
        responses={
            (200, XLSX_CONTENT_TYPE): OpenApiResponse(OpenApiTypes.BINARY),
            400: OpenApiResponse(DetailSerializer, description="Formato ou blocos inválidos."),
            403: OpenApiResponse(DetailSerializer, description="Bloco com dados de pacientes."),
            413: OpenApiResponse(DetailSerializer, description="Corpo grande demais."),
        },
        tags=["reports"],
    )
    def post(self, request: Request) -> HttpResponse:
        self._check_size(request)
        data = request.data
        if not isinstance(data, dict):
            raise ValidationError(INVALID_BODY)
        if data.get("formato") != "excel":
            raise ValidationError(UNSUPPORTED_FORMAT)
        self._check_patient_reports(request, data.get("blocos"))

        serializer = ExportSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        blocos = serializer.validated_data["blocos"]

        today = timezone.localdate()
        response = HttpResponse(build_workbook(blocos, today), content_type=XLSX_CONTENT_TYPE)
        response["Content-Disposition"] = f'attachment; filename="{export_filename(blocos, today)}"'
        response["Cache-Control"] = "no-store"
        return response

    @staticmethod
    def _check_patient_reports(request, blocos):
        """403 for blocks with patient data the user may not see, before any validation.

        The blocks come from the client, so the history filter alone is not enough. The
        message is fixed and never echoes the body.
        """
        if not isinstance(blocos, list) or can_view_patient_reports(request.user):
            return
        if any(is_sensitive_block(bloco) for bloco in blocos):
            raise PermissionDenied(PATIENT_REPORTS_FORBIDDEN)

    @staticmethod
    def _check_size(request):
        limit = settings.REPORTS_EXPORT_MAX_BYTES
        try:
            declared = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            declared = 0
        # The declared length avoids reading a huge body; the real one covers clients
        # that do not declare it.
        if declared > limit or len(request.body) > limit:
            raise ExportTooLarge()
