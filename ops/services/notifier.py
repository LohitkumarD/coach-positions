from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Iterable

from django.conf import settings
from django.utils import timezone

from ops.models import AlertEvent, DeviceToken, NotificationDelivery, UserProfile

logger = logging.getLogger(__name__)


class PushNotifier:
    def __init__(self) -> None:
        self.enabled = bool(settings.FCM_CREDENTIALS_JSON)
        self._messaging = None
        if self.enabled:
            self._initialize_firebase()

    def _initialize_firebase(self) -> None:
        try:
            import firebase_admin
            from firebase_admin import credentials, messaging

            if not firebase_admin._apps:
                cred_info = json.loads(settings.FCM_CREDENTIALS_JSON)
                firebase_admin.initialize_app(credentials.Certificate(cred_info))
            self._messaging = messaging
        except Exception as exc:  # noqa: BLE001
            logger.exception("FCM initialization failed: %s", exc)
            self.enabled = False

    def dispatch_alert(self, alert: AlertEvent, users: Iterable[UserProfile]) -> None:
        user_ids = [u.id for u in users]
        tokens = DeviceToken.objects.filter(user_id__in=user_ids, is_active=True)
        for token in tokens:
            delivery, _ = NotificationDelivery.objects.get_or_create(
                alert=alert,
                user=token.user,
                channel="push",
                defaults={"status": "pending"},
            )
            self._send_single(delivery, token.token)

    def _send_single(self, delivery: NotificationDelivery, token: str) -> None:
        delivery.attempt_count += 1
        delivery.last_attempt_at = timezone.now()
        if not self.enabled:
            delivery.status = "degraded_fallback"
            delivery.last_error = "FCM unavailable; rely on in-app inbox."
            delivery.save(update_fields=["attempt_count", "last_attempt_at", "status", "last_error"])
            return
        try:
            payload = self._messaging.Message(
                token=token,
                data={
                    "alertId": str(delivery.alert_id),
                    "trainNo": delivery.alert.train_service.train_no,
                    "alertType": delivery.alert.alert_type,
                    "priority": delivery.alert.priority,
                    "timestamp": delivery.alert.created_at.isoformat(),
                },
            )
            message_id = self._messaging.send(payload)
            delivery.status = "sent"
            delivery.provider_message_id = message_id
            delivery.last_error = ""
        except Exception as exc:  # noqa: BLE001
            delivery.status = "retry"
            delivery.last_error = str(exc)
            delay_seconds = settings.ALERT_RETRY_BACKOFF_SECONDS * min(delivery.attempt_count, settings.ALERT_RETRY_MAX_ATTEMPTS)
            delivery.next_attempt_at = timezone.now() + timedelta(seconds=delay_seconds)
        finally:
            delivery.save()
