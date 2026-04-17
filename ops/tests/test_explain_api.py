import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from ops.models import CandidateComposition, ConfidenceBand, DecisionSnapshot


@pytest.mark.django_db
def test_explain_returns_latest_snapshot(user_factory, train_service_factory):
    service = train_service_factory()
    user = user_factory(username="sup-explain", role="supervisor")
    c1 = CandidateComposition.objects.create(
        train_service=service,
        sequence_hash="h1",
        sequence_signature="1:ENG|2:GS|3:S1",
        normalized_sequence=["ENG", "GS", "S1"],
        support_count=1,
        score_breakup={"freqScore": 1},
        final_score=1.0,
    )
    c2 = CandidateComposition.objects.create(
        train_service=service,
        sequence_hash="h2",
        sequence_signature="1:ENG|2:GS|3:S2",
        normalized_sequence=["ENG", "GS", "S2"],
        support_count=2,
        score_breakup={"freqScore": 2},
        final_score=2.0,
    )
    first = DecisionSnapshot.objects.create(
        train_service=service,
        selected_candidate=c1,
        confidence_band=ConfidenceBand.LOW,
        confidence_score=0.2,
        score_delta=0.2,
        reason_codes=["OLD"],
    )
    latest = DecisionSnapshot.objects.create(
        train_service=service,
        selected_candidate=c2,
        confidence_band=ConfidenceBand.MEDIUM,
        confidence_score=1.2,
        score_delta=1.2,
        reason_codes=["NEW"],
    )
    first.superseded_at = timezone.now()
    first.save(update_fields=["superseded_at"])

    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get(f"/api/v1/decisions/{service.id}/explain")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == latest.id
    assert data["support_count"] == 2
