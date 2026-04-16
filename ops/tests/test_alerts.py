"""Tests for composition-change alert helpers."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from django.utils import timezone

from ops.models import AlertPriority, TrainService
from ops.services import alerts


@pytest.mark.django_db
def test_priority_for_null_scheduled_arrival_uses_confidence_only():
    svc = TrainService.objects.create(
        train_no="12614",
        train_name="",
        journey_date=date(2026, 4, 16),
        scheduled_arrival=None,
    )
    assert alerts._priority_for(svc, "medium", "low") == AlertPriority.CRITICAL
    assert alerts._priority_for(svc, "medium", "medium") == AlertPriority.NORMAL


@pytest.mark.django_db
def test_priority_for_scheduled_arrival_within_45_is_critical():
    soon = timezone.now() + timedelta(minutes=30)
    svc = TrainService.objects.create(
        train_no="99999",
        train_name="",
        journey_date=date(2026, 4, 16),
        scheduled_arrival=soon,
    )
    assert alerts._priority_for(svc, "high", "medium") == AlertPriority.CRITICAL
