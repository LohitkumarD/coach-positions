from datetime import date

import pytest
from rest_framework.test import APIClient

from ops.models import CoachSubmission, SourceType


@pytest.mark.django_db
def test_composition_search_returns_metadata(train_service_factory, station_factory, user_factory):
    station = station_factory(code="SBC")
    reporter = user_factory(username="rep1")
    reporter.phone = "9876543210"
    reporter.save(update_fields=["phone"])
    service = train_service_factory(train_no="12614")
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=reporter,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG", "GS"],
        sequence_signature="1:ENG|2:GS",
        sequence_hash="a" * 64,
        idempotency_key="k-search-1",
    )

    viewer = user_factory(username="viewer1")
    client = APIClient()
    client.force_authenticate(user=viewer)
    res = client.get("/api/v1/trains/composition-search?q=12614")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    hit = next(x for x in rows if x["trainNo"] == "12614")
    assert hit["stationCode"] == "SBC"
    assert hit["updatedByPhone"] == "9876543210"
    assert hit["lastUpdatedAt"]


@pytest.mark.django_db
def test_composition_search_no_query_lists_all(train_service_factory, user_factory):
    train_service_factory(train_no="12614")
    train_service_factory(train_no="22615")
    client = APIClient()
    client.force_authenticate(user=user_factory())
    res = client.get("/api/v1/trains/composition-search?limit=100")
    assert res.status_code == 200
    nos = {row["trainNo"] for row in res.json()}
    assert "12614" in nos and "22615" in nos


@pytest.mark.django_db
def test_composition_search_bubbles_up_recently_submitted_old_journey(train_service_factory, station_factory, user_factory):
    """Trains with a fresh submission should not disappear behind many newer journey_date rows."""
    station = station_factory(code="SBC")
    user = user_factory()
    # Many "newer" journey trains with no activity to fill the head of the old ordering.
    for i in range(15):
        train_service_factory(train_no=f"7{i:04d}", journey_date=date(2026, 6, 1))
    old = train_service_factory(train_no="88888", journey_date=date(2019, 1, 1))
    CoachSubmission.objects.create(
        train_service=old,
        submitted_by=user,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG"],
        sequence_signature="1:ENG",
        sequence_hash="b" * 64,
        idempotency_key="bubble-1",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get("/api/v1/trains/composition-search?limit=10")
    assert res.status_code == 200
    rows = res.json()
    assert rows[0]["trainNo"] == "88888"
