from django.core.management.base import BaseCommand
from django.utils import timezone

from ops.models import NotificationDelivery
from ops.services.notifier import PushNotifier


class Command(BaseCommand):
    help = "Process pending push notification retries."

    def handle(self, *args, **options):
        notifier = PushNotifier()
        pending = NotificationDelivery.objects.select_related("alert", "user").filter(
            status__in=["pending", "retry"],
            next_attempt_at__lte=timezone.now(),
        )[:200]
        count = 0
        for delivery in pending:
            token = delivery.user.device_tokens.filter(is_active=True).first()
            if not token:
                delivery.status = "no_device"
                delivery.last_error = "No active token"
                delivery.save(update_fields=["status", "last_error"])
                continue
            notifier._send_single(delivery, token.token)
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Processed {count} notification deliveries"))
