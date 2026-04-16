"""Allow sign-in with phone number (stored on UserProfile) or username."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

UserModel = get_user_model()


class PhoneOrUsernameBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None
        username = username.strip()
        digits_only = "".join(c for c in username if c.isdigit())
        user = UserModel.objects.filter(username__iexact=username).first()
        if user is None and len(digits_only) >= 10:
            user = UserModel.objects.filter(phone=digits_only).first()
        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
