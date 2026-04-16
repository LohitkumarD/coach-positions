import pytest
from rest_framework.test import APIClient

from ops.models import UserRole


@pytest.mark.django_db
def test_me_endpoint_returns_role(user_factory):
    user = user_factory(username="meuser", role=UserRole.CONTRIBUTOR)
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get("/api/v1/me")
    assert res.status_code == 200
    data = res.json()
    assert data["username"] == "meuser"
    assert data["role"] == "contributor"
    assert data["isSupervisor"] is False


@pytest.mark.django_db
def test_smoke_create_train_and_submit(station_factory, user_factory):
    station_factory(code="RPT1")
    user = user_factory(username="smokeuser")
    client = APIClient()
    client.force_authenticate(user=user)

    res = client.post(
        "/api/v1/train-services/create",
        {"train_no": "99998", "train_name": "SMOKE RUN"},
        format="json",
    )
    assert res.status_code == 201, res.json()
    tid = res.json()["id"]

    res2 = client.post(
        "/api/v1/submissions",
        {
            "train_service_id": tid,
            "source_type": "physical_check",
            "report_station_code": "RPT1",
            "sequence_input": "ENG GS",
            "idempotency_key": "smoke-idem-1",
        },
        format="json",
    )
    assert res2.status_code == 201, res2.json()


@pytest.mark.django_db
def test_board_includes_source_summary_shape(station_factory, user_factory, train_service_factory):
    station_factory(code="RPT2")
    user = user_factory(username="boarduser")
    service = train_service_factory(train_no="88888")
    client = APIClient()
    client.force_authenticate(user=user)
    client.post(
        "/api/v1/submissions",
        {
            "train_service_id": service.id,
            "source_type": "enroute_station",
            "report_station_code": "RPT2",
            "sequence_input": "ENG S1",
            "idempotency_key": "board-shape-1",
        },
        format="json",
    )
    res = client.get("/api/v1/board", {"station": service.target_station.code})
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) >= 1
    summary = rows[0]["source_summary"]
    assert isinstance(summary, dict)
    assert "reports" in summary
    assert "uniqueStationCodes" in summary
    assert "totalReports" in summary
