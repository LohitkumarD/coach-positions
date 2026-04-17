"""Create or supersede DecisionSnapshot after submission changes."""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from ops.models import (
    ConfidenceBand,
    ConflictCase,
    ConflictStatus,
    DecisionSnapshot,
    TrainService,
    UserProfile,
    UserRole,
)
from ops.services.alerts import maybe_create_composition_change_alert
from ops.services.notifier import PushNotifier
from ops.services.reliability import apply_reliability_updates
from ops.services.scoring import recalculate_candidates


def active_decision_snapshot(service: TrainService) -> DecisionSnapshot | None:
    """Latest snapshot that is still current (not superseded)."""
    return (
        DecisionSnapshot.objects.filter(train_service=service, superseded_at__isnull=True)
        .order_by("-effective_at")
        .select_related("selected_candidate")
        .first()
    )


def publish_decision_for_service(
    service: TrainService,
    acting_user,
    *,
    audit_fn=None,
    audit_action: str = "",
    audit_entity_type: str = "TrainService",
    audit_entity_id: int | None = None,
    audit_payload: dict | None = None,
) -> dict[str, Any]:
    """
    Recalculate candidates from current submissions and publish a new snapshot when possible.

    If there is no winning candidate, any active snapshot is superseded so the board can go empty.

    Returns:
      no_snapshot: bool — True when no top candidate (HTTP 202-style for creates)
      snapshot: DecisionSnapshot | None
      result: dict from recalculate_candidates
    """
    previous = active_decision_snapshot(service)
    result = recalculate_candidates(service)
    top = result["top_candidate"]
    runner = result["runner_up"]

    if not top:
        if previous:
            previous.superseded_at = timezone.now()
            previous.save(update_fields=["superseded_at"])
        return {"no_snapshot": True, "snapshot": None, "result": result}

    if previous:
        previous.superseded_at = timezone.now()
        previous.save(update_fields=["superseded_at"])

    snapshot = DecisionSnapshot.objects.create(
        train_service=service,
        selected_candidate=top,
        runner_up_candidate=runner,
        confidence_band=result["confidence_band"],
        confidence_score=result["confidence_score"],
        score_delta=result["confidence_score"],
        reason_codes=result["reason_codes"],
        reason_details=result["reason_details"],
    )
    apply_reliability_updates(result["submissions"], final_sequence_hash=top.sequence_hash)

    if result["confidence_band"] == ConfidenceBand.LOW:
        ConflictCase.objects.get_or_create(
            train_service=service,
            status=ConflictStatus.OPEN,
            defaults={
                "top_candidates": [
                    {"hash": top.sequence_hash, "score": top.final_score, "sequence": top.normalized_sequence},
                    {
                        "hash": runner.sequence_hash if runner else "",
                        "score": runner.final_score if runner else 0.0,
                        "sequence": runner.normalized_sequence if runner else [],
                    },
                ]
            },
        )

    alert = maybe_create_composition_change_alert(service, previous, snapshot)
    if alert:
        users = UserProfile.objects.filter(role__in=[UserRole.SUPERVISOR, UserRole.ADMIN], is_active=True)
        PushNotifier().dispatch_alert(alert, users)

    if audit_fn and audit_action:
        audit_fn(
            acting_user,
            audit_action,
            audit_entity_type,
            audit_entity_id if audit_entity_id is not None else service.id,
            audit_payload or {"trainServiceId": service.id, "decisionId": snapshot.id},
        )

    return {"no_snapshot": False, "snapshot": snapshot, "result": result}
