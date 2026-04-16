from django.contrib import admin
from django.http import HttpResponse, HttpResponseForbidden
from django.urls import include, path
from django_ratelimit.exceptions import Ratelimited

from ops.views import register

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/register/", register, name="register"),
    path("accounts/", include("django.contrib.auth.urls")),
    path("", include("ops.urls")),
]


def handler403(request, exception=None):
    if isinstance(exception, Ratelimited):
        return HttpResponse("Too many requests", status=429)
    return HttpResponseForbidden("Forbidden")
