from rest_framework.routers import SimpleRouter

from .views import ConversationViewSet

app_name = "chat"

router = SimpleRouter()
router.register("conversations", ConversationViewSet, basename="conversation")

urlpatterns = router.urls
