from django.contrib import admin
from django.http import HttpResponse, HttpResponseForbidden
from django.urls import include, path
from django_ratelimit.exceptions import Ratelimited

from ops.views import pwa_incoming_share, pwa_service_worker, register

urlpatterns = [
    path("admin/", admin.site.urls),
    path("pwa/incoming-share", pwa_incoming_share, name="pwa-incoming-share"),
    path("sw.js", pwa_service_worker, name="pwa-service-worker"),
    path("accounts/register/", register, name="register"),
    path("accounts/", include("django.contrib.auth.urls")),
    path("", include("ops.urls")),
]


def handler403(request, exception=None):
    if isinstance(exception, Ratelimited):
        return HttpResponse("Too many requests", status=429)
    return HttpResponseForbidden("Forbidden")
