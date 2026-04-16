from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _

from . import models

admin.site.register(models.Station)


@admin.register(models.UserProfile)
class UserProfileAdmin(BaseUserAdmin):
    ordering = ("phone",)
    list_display = ("phone", "email", "role", "is_staff", "is_active")
    search_fields = ("phone", "email")
    fieldsets = (
        (None, {"fields": ("phone", "password")}),
        (_("Personal info"), {"fields": ("first_name", "last_name", "email")}),
        (
            _("Permissions"),
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                ),
            },
        ),
        (_("Important dates"), {"fields": ("last_login", "date_joined")}),
        (_("Profile"), {"fields": ("role", "home_station", "reliability_score", "reliability_events")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("phone", "password1", "password2", "role"),
            },
        ),
    )
admin.site.register(models.TrainService)
admin.site.register(models.RouteStopRank)
admin.site.register(models.CoachSubmission)
admin.site.register(models.CandidateComposition)
admin.site.register(models.DecisionSnapshot)
admin.site.register(models.ConflictCase)
admin.site.register(models.AlertEvent)
admin.site.register(models.NotificationDelivery)
admin.site.register(models.DeviceToken)
@admin.register(models.AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ("action", "entity_type", "entity_id", "created_at")
    readonly_fields = ("actor", "action", "entity_type", "entity_id", "payload", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
