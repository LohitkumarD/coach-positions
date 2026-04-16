# Generated manually for phone-primary identity.

import re

from django.contrib.auth.base_user import BaseUserManager
from django.db import migrations, models


class CustomUserManager(BaseUserManager):
    """Copy for migrations only — keep in sync with ops.models.CustomUserManager."""

    use_in_migrations = True

    def create_user(self, phone, password=None, **extra_fields):
        phone = re.sub(r"\D", "", str(phone or ""))
        if not phone:
            raise ValueError("The given phone must be set")
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        user = self.model(phone=phone, username=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(phone, password, **extra_fields)


def _digits_only(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def forwards_phone_migration(apps, schema_editor):
    UserProfile = apps.get_model("ops", "UserProfile")
    for u in UserProfile.objects.all():
        raw_phone = (u.phone or "").strip()
        norm_phone = _digits_only(raw_phone) if raw_phone else ""
        username_digits = _digits_only(u.username or "")

        if not norm_phone and username_digits and len(username_digits) >= 10:
            norm_phone = username_digits[:15]

        if norm_phone:
            norm_phone = norm_phone[:15]
            UserProfile.objects.filter(pk=u.pk).update(phone=norm_phone, username=norm_phone)
        else:
            placeholder = f"9{u.pk:014d}"[:15]
            UserProfile.objects.filter(pk=u.pk).update(phone=placeholder, username=placeholder, is_active=False)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("ops", "0005_userprofile_phone"),
    ]

    operations = [
        migrations.RunPython(forwards_phone_migration, noop_reverse),
        migrations.AlterField(
            model_name="userprofile",
            name="phone",
            field=models.CharField(
                help_text="Digits only; primary sign-in identifier (mirrored to username).",
                max_length=15,
                unique=True,
            ),
        ),
        migrations.AlterModelManagers(
            name="userprofile",
            managers=[
                ("objects", CustomUserManager()),
            ],
        ),
    ]
