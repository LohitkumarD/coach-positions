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
        user = UserModel.objects.filter(username__iexact=username).first()
        if user is None:
            digits = "".join(c for c in username if c.isdigit())
            if len(digits) >= 10:
                user = UserModel.objects.filter(phone=digits).first()
            if user is None and username.isdigit() and len(username) >= 10:
                user = UserModel.objects.filter(phone=username).first()
        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
