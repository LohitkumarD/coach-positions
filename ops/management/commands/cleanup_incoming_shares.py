from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ops.models import IncomingShareImage


class Command(BaseCommand):
    help = "Delete IncomingShareImage rows older than the given age (default 48h)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=48,
            help="Delete rows older than this many hours (default 48).",
        )

    def handle(self, *args, **options):
        hours = max(1, int(options["hours"]))
        cutoff = timezone.now() - timedelta(hours=hours)
        qs = IncomingShareImage.objects.filter(created_at__lt=cutoff)
        n, _ = qs.delete()
        self.stdout.write(self.style.SUCCESS(f"Deleted {n} incoming share row(s) older than {hours}h."))
