from datetime import timedelta

import pytest
from django.utils import timezone

from ops.models import CoachSubmission, SourceType
from ops.services.scoring import recalculate_candidates


@pytest.mark.django_db
def test_recalculate_candidates_selects_top(train_service_factory, station_factory, user_factory):
    service = train_service_factory()
    station = station_factory(code="SBC")
    user_a = user_factory(username="u1")
    user_b = user_factory(username="u2")
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=user_a,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        normalized_sequence=["ENG", "GS", "S1"],
        sequence_signature="1:ENG|2:GS|3:S1",
        sequence_hash="h1",
        idempotency_key="k1",
        submitted_at=timezone.now() - timedelta(minutes=2),
    )
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=user_b,
        source_type=SourceType.ENROUTE_STATION,
        report_station=station,
        normalized_sequence=["ENG", "GS", "S1"],
        sequence_signature="1:ENG|2:GS|3:S1",
        sequence_hash="h1",
        idempotency_key="k2",
        submitted_at=timezone.now() - timedelta(minutes=3),
    )
    result = recalculate_candidates(service)
    assert result["top_candidate"] is not None
    assert result["top_candidate"].sequence_hash == "h1"
