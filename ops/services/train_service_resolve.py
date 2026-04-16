"""Resolve TrainService for a submission from train number (lookup or create)."""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from ops.models import TrainService


def resolve_train_service_for_submission(
    train_no: str,
    journey_date: date | None,
    train_name: str = "",
) -> TrainService:
    """
    Find an existing TrainService for this train number, or create one.

    - If journey_date is set: match (train_no, journey_date) or create that row.
    - Else: prefer today's row for train_no, else latest journey_date for train_no, else create (train_no, today).
    """
    tn = train_no.strip()
    if not tn:
        raise ValueError("train_no is empty")
    today = timezone.localdate()
    name = (train_name or "").strip()

    if journey_date is not None:
        row = TrainService.objects.filter(train_no=tn, journey_date=journey_date).order_by("-id").first()
        if row:
            if name and not row.train_name:
                row.train_name = name
                row.save(update_fields=["train_name"])
            return row
        return TrainService.objects.create(
            train_no=tn,
            journey_date=journey_date,
            train_name=name,
        )

    row = TrainService.objects.filter(train_no=tn, journey_date=today).order_by("-id").first()
    if row:
        return row

    row = TrainService.objects.filter(train_no=tn).order_by("-journey_date", "-id").first()
    if row:
        return row

    return TrainService.objects.create(train_no=tn, journey_date=today, train_name=name)
