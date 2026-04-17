"""Set a user's primary phone (and username) and reactivate — for recovery after phone-primary migration."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from ops.phone_utils import normalize_phone


class Command(BaseCommand):
    help = "Set phone + username to the same digits and is_active=True (e.g. recover a staff user deactivated by migration 0006)."

    def add_arguments(self, parser):
        parser.add_argument("--phone", required=True, help="10–15 digit mobile (spaces ok; stored digits-only)")
        g = parser.add_mutually_exclusive_group(required=True)
        g.add_argument("--email", help="Match user by email (exact)")
        g.add_argument("--user-id", type=int, help="Match user by primary key")

    def handle(self, *args, **options):
        User = get_user_model()
        phone = normalize_phone(options["phone"])
        if len(phone) < 10:
            raise CommandError("Phone must normalize to at least 10 digits.")

        if options.get("user_id") is not None:
            qs = User.objects.filter(pk=options["user_id"])
        else:
            qs = User.objects.filter(email__iexact=(options["email"] or "").strip())

        user = qs.first()
        if not user:
            raise CommandError("No user matched.")

        if User.objects.filter(phone=phone).exclude(pk=user.pk).exists():
            raise CommandError(f"Another user already uses phone {phone}.")

        user.phone = phone
        user.username = phone
        user.is_active = True
        user.save(update_fields=["phone", "username", "is_active"])
        self.stdout.write(self.style.SUCCESS(f"Updated user id={user.pk}: phone/username={phone}, is_active=True"))
