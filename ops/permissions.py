from rest_framework.permissions import BasePermission

from ops.models import UserRole


class IsContributorOrAbove(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {
            UserRole.CONTRIBUTOR,
            UserRole.SUPERVISOR,
            UserRole.ADMIN,
        }


class IsSupervisorOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in {
            UserRole.SUPERVISOR,
            UserRole.ADMIN,
        }
