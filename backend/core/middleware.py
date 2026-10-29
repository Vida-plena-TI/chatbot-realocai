from django.utils.cache import patch_cache_control

API_PREFIX = "/api/"
# Public liveness probe: no user data, and the platform may poll it often.
UNCACHED_EXEMPT_PATHS = frozenset({"/api/health/"})


class NoStoreApiMiddleware:
    """`Cache-Control: no-store, private` on every API response.

    API answers carry health data (messages, report blocks) and must never be kept by
    the browser or a proxy. Directives set by the view are kept and these two are added
    (a `public` one is dropped by patch_cache_control), so nothing becomes less strict.
    Static files and the admin are outside /api/.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith(API_PREFIX) and request.path not in UNCACHED_EXEMPT_PATHS:
            patch_cache_control(response, no_store=True, private=True)
        return response
