from __future__ import annotations

from django.conf import settings
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

from ops.phone_utils import normalize_phone


class CustomUserManager(BaseUserManager):
    """Phone is the canonical identifier; username is always mirrored for Django."""

    use_in_migrations = True

    def create_user(self, phone, password=None, **extra_fields):
        phone = normalize_phone(phone)
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


class UserRole(models.TextChoices):
    CONTRIBUTOR = "contributor", "Contributor"
    SUPERVISOR = "supervisor", "Supervisor"
    VIEWER = "viewer", "Viewer"
    ADMIN = "admin", "Admin"


class SourceType(models.TextChoices):
    PHYSICAL_CHECK = "physical_check", "Physical Check"
    TTE_ONBOARD = "tte_onboard", "TTE Onboard"
    ENROUTE_STATION = "enroute_station", "Enroute Station"
    ORIGIN_STATION = "origin_station", "Origin Station"
    FORWARDED_MESSAGE = "forwarded_message", "Forwarded Message"


class ConfidenceBand(models.TextChoices):
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"


class ConflictStatus(models.TextChoices):
    OPEN = "open", "Open"
    RESOLVED = "resolved", "Resolved"
    LOCKED = "locked", "Locked"


class AlertPriority(models.TextChoices):
    CRITICAL = "critical", "Critical"
    HIGH = "high", "High"
    NORMAL = "normal", "Normal"


class AlertType(models.TextChoices):
    COMPOSITION_CHANGE = "composition_change", "Composition Change"
    CONFLICT_LOW_CONFIDENCE = "conflict_low_confidence", "Low Confidence Conflict"
    CONFIDENCE_DROP = "confidence_drop", "Confidence Drop"


class Station(models.Model):
    code = models.CharField(max_length=8, unique=True)
    name = models.CharField(max_length=120)
    division = models.CharField(max_length=120)
    zone = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)

    class Meta:
        indexes = [models.Index(fields=["division", "zone"])]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"


class UserProfile(AbstractUser):
    USERNAME_FIELD = "phone"
    REQUIRED_FIELDS: list[str] = []

    role = models.CharField(max_length=24, choices=UserRole.choices, default=UserRole.CONTRIBUTOR)
    phone = models.CharField(
        max_length=15,
        unique=True,
        help_text="Digits only; primary sign-in identifier (mirrored to username).",
    )
    home_station = models.ForeignKey(Station, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    reliability_score = models.FloatField(default=0.5)
    reliability_events = models.PositiveIntegerField(default=0)

    objects = CustomUserManager()

    class Meta:
        indexes = [models.Index(fields=["role", "is_active"])]

    def save(self, *args, **kwargs):
        if self.phone:
            self.phone = normalize_phone(self.phone)
            self.username = self.phone
        super().save(*args, **kwargs)


class TrainService(models.Model):
    train_no = models.CharField(max_length=12)
    train_name = models.CharField(max_length=180, blank=True)
    journey_date = models.DateField()
    origin_station = models.ForeignKey(Station, null=True, blank=True, on_delete=models.PROTECT, related_name="origin_services")
    destination_station = models.ForeignKey(Station, null=True, blank=True, on_delete=models.PROTECT, related_name="destination_services")
    target_station = models.ForeignKey(Station, null=True, blank=True, on_delete=models.PROTECT, related_name="target_services")
    scheduled_arrival = models.DateTimeField(null=True, blank=True)
    scheduled_departure = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["train_no", "journey_date", "target_station"], name="uniq_train_journey_target")]
        indexes = [
            models.Index(fields=["journey_date", "target_station"]),
            models.Index(fields=["scheduled_arrival"]),
        ]

    def __str__(self) -> str:
        return f"{self.train_no} {self.journey_date}"


class RouteStopRank(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="route_ranks")
    station = models.ForeignKey(Station, on_delete=models.CASCADE, related_name="route_ranks")
    rank = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["train_service", "station"], name="uniq_service_station_rank"),
            models.UniqueConstraint(fields=["train_service", "rank"], name="uniq_service_rank"),
        ]
        indexes = [models.Index(fields=["train_service", "rank"])]


class CoachSubmission(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="submissions")
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="coach_submissions")
    source_type = models.CharField(max_length=24, choices=SourceType.choices)
    report_station = models.ForeignKey(
        Station,
        on_delete=models.PROTECT,
        related_name="reported_submissions",
        null=True,
        blank=True,
    )
    raw_text = models.TextField(blank=True)
    normalized_sequence = models.JSONField(default=list)
    sequence_signature = models.TextField(default="", db_index=True)
    sequence_hash = models.CharField(max_length=64, db_index=True)
    submitted_at = models.DateTimeField(default=timezone.now)
    is_valid = models.BooleanField(default=True)
    validation_errors = models.JSONField(default=list, blank=True)
    idempotency_key = models.CharField(max_length=64, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["submitted_by", "idempotency_key"], name="uniq_submitter_idempotency")]
        indexes = [
            models.Index(fields=["train_service", "submitted_at"]),
            models.Index(fields=["train_service", "sequence_hash"]),
            models.Index(fields=["source_type", "report_station"]),
        ]


class CandidateComposition(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="candidates")
    sequence_hash = models.CharField(max_length=64, db_index=True)
    sequence_signature = models.TextField(default="", db_index=True)
    normalized_sequence = models.JSONField(default=list)
    support_count = models.PositiveIntegerField(default=0)
    score_breakup = models.JSONField(default=dict)
    final_score = models.FloatField(default=0.0)
    last_evaluated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["train_service", "sequence_hash"], name="uniq_candidate_per_service")]
        indexes = [models.Index(fields=["train_service", "-final_score"])]


class DecisionSnapshot(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="decision_snapshots")
    selected_candidate = models.ForeignKey(CandidateComposition, on_delete=models.PROTECT, related_name="+")
    runner_up_candidate = models.ForeignKey(CandidateComposition, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    confidence_band = models.CharField(max_length=16, choices=ConfidenceBand.choices)
    confidence_score = models.FloatField(default=0.0)
    score_delta = models.FloatField(default=0.0)
    reason_codes = models.JSONField(default=list)
    reason_details = models.JSONField(default=dict)
    effective_at = models.DateTimeField(default=timezone.now)
    superseded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["train_service", "-effective_at"]),
            models.Index(fields=["confidence_band"]),
        ]


class ConflictCase(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="conflicts")
    status = models.CharField(max_length=16, choices=ConflictStatus.choices, default=ConflictStatus.OPEN)
    top_candidates = models.JSONField(default=list)
    opened_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="resolved_conflicts")
    resolution_note = models.TextField(blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["status", "opened_at"])]


class AlertEvent(models.Model):
    train_service = models.ForeignKey(TrainService, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=32, choices=AlertType.choices)
    priority = models.CharField(max_length=12, choices=AlertPriority.choices, default=AlertPriority.NORMAL)
    previous_sequence = models.JSONField(default=list)
    new_sequence = models.JSONField(default=list)
    confidence_before = models.CharField(max_length=16, blank=True)
    confidence_after = models.CharField(max_length=16, blank=True)
    dedupe_key = models.CharField(max_length=128, unique=True)
    created_at = models.DateTimeField(default=timezone.now)
    ack_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="acknowledged_alerts")
    ack_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["priority", "created_at"])]


class NotificationDelivery(models.Model):
    alert = models.ForeignKey(AlertEvent, on_delete=models.CASCADE, related_name="deliveries")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_deliveries")
    channel = models.CharField(max_length=16, default="push")
    status = models.CharField(max_length=24, default="pending")
    provider_message_id = models.CharField(max_length=255, blank=True)
    attempt_count = models.PositiveIntegerField(default=0)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_error = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["alert", "user", "channel"], name="uniq_alert_user_channel")]
        indexes = [models.Index(fields=["status", "next_attempt_at"])]


class DeviceToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="device_tokens")
    token = models.CharField(max_length=512, unique=True)
    platform = models.CharField(max_length=32, default="webpush")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["user", "is_active"])]


class AuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events")
    action = models.CharField(max_length=128)
    entity_type = models.CharField(max_length=64)
    entity_id = models.CharField(max_length=64)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [models.Index(fields=["entity_type", "entity_id", "-created_at"])]

    def delete(self, using=None, keep_parents=False):
        raise RuntimeError("AuditEvent is append-only and cannot be deleted.")

