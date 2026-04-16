from __future__ import annotations

import re

from django import forms
from django.contrib.auth import get_user_model

from ops.models import UserRole

User = get_user_model()


class UserRegistrationForm(forms.Form):
    phone = forms.CharField(max_length=32, label="Phone number")
    password1 = forms.CharField(widget=forms.PasswordInput, label="Password")
    password2 = forms.CharField(widget=forms.PasswordInput, label="Confirm password")
    email = forms.EmailField(required=False, label="Email (optional)")

    def clean_phone(self):
        raw = self.cleaned_data.get("phone", "")
        phone = re.sub(r"\D", "", raw)
        if len(phone) < 10:
            raise forms.ValidationError("Enter a valid phone number (at least 10 digits).")
        if len(phone) > 15:
            raise forms.ValidationError("Phone number is too long.")
        if User.objects.filter(phone=phone).exists():
            raise forms.ValidationError("An account with this phone number already exists.")
        return phone

    def clean(self):
        cleaned = super().clean()
        p1 = cleaned.get("password1")
        p2 = cleaned.get("password2")
        if p1 and p2 and p1 != p2:
            self.add_error("password2", "The two password fields do not match.")
        return cleaned

    def save(self):
        email = (self.cleaned_data.get("email") or "").strip()
        return User.objects.create_user(
            self.cleaned_data["phone"],
            password=self.cleaned_data["password1"],
            email=email,
            role=UserRole.CONTRIBUTOR,
        )
