from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from ops.models import AlertEvent, AlertPriority, AlertType, DecisionSnapshot, TrainService


def _priority_for(service: TrainService, band_before: str, band_after: str) -> str:
    arrival = service.scheduled_arrival
    if arrival is not None:
        eta_minutes = (arrival - timezone.now()).total_seconds() / 60.0
        within_45 = eta_minutes <= 45
    else:
        # No ETA on the train service: never infer proximity; still honor confidence-based rules.
        within_45 = False
    if within_45 or band_after == "low":
        return AlertPriority.CRITICAL
    if band_before in {"high", "medium"} and band_after == "low":
        return AlertPriority.HIGH
    return AlertPriority.NORMAL


def maybe_create_composition_change_alert(service: TrainService, previous: DecisionSnapshot | None, current: DecisionSnapshot) -> AlertEvent | None:
    if not previous:
        return None
    prev_seq = previous.selected_candidate.normalized_sequence
    next_seq = current.selected_candidate.normalized_sequence
    if prev_seq == next_seq:
        return None

    # Debounce: skip if we emitted same transition in last 2 minutes.
    dedupe_key = f"{service.id}:{previous.id}:{current.id}"
    if AlertEvent.objects.filter(dedupe_key=dedupe_key).exists():
        return None
    if AlertEvent.objects.filter(
        train_service=service,
        alert_type=AlertType.COMPOSITION_CHANGE,
        created_at__gte=timezone.now() - timedelta(minutes=2),
    ).exists():
        return None

    return AlertEvent.objects.create(
        train_service=service,
        alert_type=AlertType.COMPOSITION_CHANGE,
        priority=_priority_for(service, previous.confidence_band, current.confidence_band),
        previous_sequence=prev_seq,
        new_sequence=next_seq,
        confidence_before=previous.confidence_band,
        confidence_after=current.confidence_band,
        dedupe_key=dedupe_key,
    )
