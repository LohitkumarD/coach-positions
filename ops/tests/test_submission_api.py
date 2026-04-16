import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_submission_creates_decision(train_service_factory, station_factory, user_factory):
    service = train_service_factory()
    report_station = station_factory(code="RPT1")
    user = user_factory(username="apiuser")
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.post(
        "/api/v1/submissions",
        {
            "train_service_id": service.id,
            "source_type": "physical_check",
            "report_station_code": report_station.code,
            "sequence_input": "ENG GS S1",
            "idempotency_key": "idem-1",
        },
        format="json",
    )
    assert res.status_code == 201, res.json()


@pytest.mark.django_db
def test_submission_without_report_station(train_service_factory, user_factory):
    service = train_service_factory()
    user = user_factory(username="apiuser2")
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.post(
        "/api/v1/submissions",
        {
            "train_service_id": service.id,
            "source_type": "physical_check",
            "sequence_input": "ENG GS S1",
            "idempotency_key": "idem-no-station",
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    from ops.models import CoachSubmission

    sub = CoachSubmission.objects.get(idempotency_key="idem-no-station")
    assert sub.report_station_id is None


@pytest.mark.django_db
def test_submission_by_train_no_creates_service(train_service_factory, user_factory):
    """Submit with train_no only: creates TrainService when none exists."""
    user = user_factory(username="bytrainno")
    client = APIClient()
    client.force_authenticate(user=user)
    from ops.models import TrainService

    assert not TrainService.objects.filter(train_no="99999").exists()
    res = client.post(
        "/api/v1/submissions",
        {
            "train_no": "99999",
            "source_type": "physical_check",
            "sequence_input": "ENG GS S1",
            "idempotency_key": "idem-by-no",
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body.get("trainServiceId")
    svc = TrainService.objects.get(train_no="99999")
    assert svc.id == body["trainServiceId"]


@pytest.mark.django_db
def test_submission_by_train_no_reuses_existing(train_service_factory, user_factory):
    existing = train_service_factory(train_no="88888")
    user = user_factory(username="reuse")
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.post(
        "/api/v1/submissions",
        {
            "train_no": "88888",
            "source_type": "physical_check",
            "sequence_input": "PC SLRD",
            "idempotency_key": "idem-reuse",
        },
        format="json",
    )
    assert res.status_code == 201, res.json()
    assert res.json().get("trainServiceId") == existing.id
