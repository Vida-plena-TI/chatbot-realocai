from django.db.models import Count
from django.http import Http404
from drf_spectacular.utils import (
    OpenApiParameter,
    OpenApiResponse,
    extend_schema,
    inline_serializer,
)
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import Conversation
from .serializers import (
    INVALID_STATUS,
    ConversationCreateSerializer,
    ConversationSerializer,
    ExchangeSerializer,
    MessageCreateSerializer,
    MessageSerializer,
)
from .services.agent import AgentUnavailableError, ConversationBusyError, exchange_messages
from .services.conversations import create_conversation, soft_delete_conversation

DetailSerializer = inline_serializer("ChatDetail", fields={"detail": serializers.CharField()})

ARCHIVED_CONVERSATION = "Conversas arquivadas não aceitam novas mensagens."
CONVERSATION_NOT_FOUND = "Conversa não encontrada."


class ConversationPagination(PageNumberPagination):
    # Page sizes follow the SPA's mock client. A page past the end is a 404.
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class MessagePagination(ConversationPagination):
    page_size = 30


@extend_schema(tags=["conversations"])
class ConversationViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Conversations of the logged-in user.

    Other users' and soft-deleted conversations are outside the queryset, so they
    answer 404 (never 403) and their existence is not revealed.
    """

    pagination_class = ConversationPagination
    # Only applied to sending messages (see get_throttles): ScopedRateThrottle keys on
    # the user id for authenticated requests.
    throttle_scope = "chat_messages"
    # PATCH only: PUT would require resending every writable field.
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI schema generation
            return Conversation.objects.none()
        queryset = Conversation.objects.filter(user=self.request.user, deleted_at__isnull=True)
        if self.action == "list":
            queryset = self._filter_by_status(queryset)
        if self.action in ("list", "retrieve", "partial_update"):
            queryset = queryset.annotate(message_count=Count("messages"))
        # Explicit: Meta.ordering is ignored by aggregated (GROUP BY) queries.
        return queryset.order_by("-updated_at")

    def get_object(self):
        try:
            return super().get_object()
        except Http404:
            raise NotFound(CONVERSATION_NOT_FOUND) from None

    def _filter_by_status(self, queryset):
        value = self.request.query_params.get("status")
        if value is None:
            return queryset
        if value not in Conversation.Status.values:
            raise ValidationError(INVALID_STATUS)
        return queryset.filter(status=value)

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "status",
                str,
                enum=Conversation.Status.values,
                description="Filtra pelo status. Ausente: todas as conversas.",
            )
        ],
        responses={
            200: ConversationSerializer(many=True),
            400: OpenApiResponse(DetailSerializer, description="status inválido."),
        },
    )
    def list(self, request: Request, *args, **kwargs) -> Response:
        return super().list(request, *args, **kwargs)

    def get_throttles(self):
        if self.action == "messages" and self.request.method == "POST":
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "create":
            return ConversationCreateSerializer
        return ConversationSerializer

    def perform_create(self, serializer):
        serializer.instance = create_conversation(
            self.request.user, title=serializer.validated_data.get("title", "")
        )

    def perform_destroy(self, instance):
        soft_delete_conversation(instance)

    @extend_schema(methods=["GET"], responses=MessageSerializer(many=True))
    @extend_schema(
        methods=["POST"],
        request=MessageCreateSerializer,
        responses={
            201: ExchangeSerializer,
            400: OpenApiResponse(description="Conteúdo inválido ou conversa arquivada."),
            409: OpenApiResponse(DetailSerializer, description="Mensagem em andamento."),
            429: OpenApiResponse(DetailSerializer, description="Muitas mensagens."),
            502: OpenApiResponse(DetailSerializer, description="Agente indisponível."),
        },
    )
    @action(detail=True, methods=["get", "post"])
    def messages(self, request: Request, pk=None) -> Response:
        conversation = self.get_object()
        if request.method == "GET":
            paginator = MessagePagination()
            page = paginator.paginate_queryset(
                conversation.messages.order_by("seq"), request, view=self
            )
            return paginator.get_paginated_response(MessageSerializer(page, many=True).data)

        if conversation.status == Conversation.Status.ARCHIVED:
            return Response({"detail": ARCHIVED_CONVERSATION}, status=status.HTTP_400_BAD_REQUEST)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            exchange = exchange_messages(conversation, serializer.validated_data["content"])
        except ConversationBusyError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
        except AgentUnavailableError as exc:
            # Nothing was stored: the client can resend the same text.
            return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

        return Response(ExchangeSerializer(exchange).data, status=status.HTTP_201_CREATED)
