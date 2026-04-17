import pytest
from rest_framework.test import APIClient

from ops.models import CoachSubmission, DecisionSnapshot, SourceType


@pytest.mark.django_db
def test_retract_latest_submission_ok(train_service_factory, station_factory, user_factory):
    station = station_factory(code="SBC")
    user = user_factory()
    service = train_service_factory(train_no="50101")
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=user,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG", "GS"],
        sequence_signature="1:ENG|2:GS",
        sequence_hash="d" * 64,
        idempotency_key="r-1",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.delete(f"/api/v1/train-services/{service.id}/retract-latest-submission")
    assert res.status_code == 200, res.json()
    assert CoachSubmission.objects.filter(train_service=service).count() == 0


@pytest.mark.django_db
def test_retract_latest_forbidden_for_other_user(train_service_factory, station_factory, user_factory):
    station = station_factory(code="SBC")
    owner = user_factory(username="91000000001")
    other = user_factory(username="91000000002")
    service = train_service_factory(train_no="50202")
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=owner,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG"],
        sequence_signature="1:ENG",
        sequence_hash="e" * 64,
        idempotency_key="r-2",
    )
    client = APIClient()
    client.force_authenticate(user=other)
    res = client.delete(f"/api/v1/train-services/{service.id}/retract-latest-submission")
    assert res.status_code == 403
    assert CoachSubmission.objects.filter(train_service=service).count() == 1


@pytest.mark.django_db
def test_retract_supersedes_active_snapshot(train_service_factory, station_factory, user_factory):
    """After retract, only non-superseded snapshots are considered active."""
    from ops.models import CandidateComposition, ConfidenceBand

    station = station_factory(code="SBC")
    user = user_factory()
    service = train_service_factory(train_no="50303")
    cand = CandidateComposition.objects.create(
        train_service=service,
        sequence_hash="f" * 64,
        sequence_signature="1:ENG",
        normalized_sequence=["ENG"],
        support_count=1,
        score_breakup={},
        final_score=1.0,
    )
    snap = DecisionSnapshot.objects.create(
        train_service=service,
        selected_candidate=cand,
        confidence_band=ConfidenceBand.LOW,
        confidence_score=0.1,
        score_delta=0.1,
        reason_codes=[],
    )
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=user,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG"],
        sequence_signature="1:ENG",
        sequence_hash="f" * 64,
        idempotency_key="r-3",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.delete(f"/api/v1/train-services/{service.id}/retract-latest-submission")
    assert res.status_code == 200
    snap.refresh_from_db()
    assert snap.superseded_at is not None
