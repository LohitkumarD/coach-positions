from __future__ import annotations

from ops.models import UserRole


def app_shell(request):
    url_name = getattr(getattr(request, "resolver_match", None), "url_name", "") or ""
    nav_active = ""
    if url_name == "board-page":
        nav_active = "board"
    elif url_name == "submit-page":
        nav_active = "submit"
    elif url_name in ("more-page", "supervisor-page"):
        nav_active = "more"

    user = request.user
    is_auth = user.is_authenticated
    role = getattr(user, "role", None) if is_auth else None
    role_display = dict(UserRole.choices).get(role, role or "") if role else ""
    show_supervisor = is_auth and role in (UserRole.SUPERVISOR, UserRole.ADMIN)

    return {
        "nav_active": nav_active,
        "ops_user_role_display": role_display,
        "ops_show_supervisor_nav": show_supervisor,
    }
