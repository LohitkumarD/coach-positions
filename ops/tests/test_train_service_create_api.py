import pytest
from rest_framework.test import APIClient
from django.utils import timezone
from datetime import timedelta


@pytest.mark.django_db
def test_contributor_can_create_train_service(user_factory):
    user = user_factory(username="creator-user", role="contributor")
    client = APIClient()
    client.force_authenticate(user=user)
    payload = {
        "train_no": "12726",
        "train_name": "SBC DEMO",
        "journey_date": str(timezone.localdate()),
        "origin_station_code": "SBC",
        "destination_station_code": "RNR",
        "target_station_code": "RNR",
        "scheduled_arrival": (timezone.now() + timedelta(hours=1)).isoformat(),
        "scheduled_departure": (timezone.now() + timedelta(hours=1, minutes=5)).isoformat(),
        "route_station_codes": ["SBC", "DVG", "RNR"],
    }
    res = client.post("/api/v1/train-services/create", payload, format="json")
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["trainNo"] == "12726"
    assert body["targetStation"] == "RNR"
