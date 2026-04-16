from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from . import models

admin.site.register(models.Station)


@admin.register(models.UserProfile)
class UserProfileAdmin(BaseUserAdmin):
    list_display = ("username", "phone", "email", "role", "is_staff", "is_active")
    search_fields = ("username", "phone", "email")
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Profile", {"fields": ("phone", "role", "home_station", "reliability_score", "reliability_events")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "password1", "password2", "phone", "role"),
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
