import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient


@pytest.mark.django_db
@override_settings(GEMINI_API_KEY="")
def test_scan_image_missing_key_returns_503(user_factory):
    client = APIClient()
    client.force_authenticate(user=user_factory())
    img = SimpleUploadedFile("a.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF", content_type="image/jpeg")
    res = client.post("/api/v1/submissions/scan-image", {"image": img}, format="multipart")
    assert res.status_code == 503
    assert "code" in res.json() or "error" in res.json()


@pytest.mark.django_db
def test_scan_image_no_file_returns_400(user_factory):
    client = APIClient()
    client.force_authenticate(user=user_factory())
    res = client.post("/api/v1/submissions/scan-image", {}, format="multipart")
    assert res.status_code == 400


@pytest.mark.django_db
def test_scan_image_mock_success(user_factory, monkeypatch):
    client = APIClient()
    client.force_authenticate(user=user_factory())

    def mock_scan(_bytes, _mime, _hint=None):
        return {
            "extractions": [
                {
                    "train_number": "17307",
                    "coach_sequence_text": "ENG GS S1",
                    "normalized_sequence": ["ENG", "GS", "S1"],
                    "validation_errors": [],
                    "sequence_signature": "1:ENG|2:GS|3:S1",
                    "sequence_hash": "abc",
                }
            ]
        }

    monkeypatch.setattr("ops.views.scan_image", mock_scan)
    img = SimpleUploadedFile("a.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF", content_type="image/jpeg")
    res = client.post("/api/v1/submissions/scan-image", {"image": img}, format="multipart")
    assert res.status_code == 200
    body = res.json()
    assert body["extractions"][0]["train_number"] == "17307"


@pytest.mark.django_db
def test_recent_sequences(train_service_factory, station_factory, user_factory):
    from ops.models import CoachSubmission, SourceType

    user = user_factory()
    station = station_factory(code="RPT1")
    service = train_service_factory()
    CoachSubmission.objects.create(
        train_service=service,
        submitted_by=user,
        source_type=SourceType.PHYSICAL_CHECK,
        report_station=station,
        raw_text="",
        normalized_sequence=["ENG", "S1"],
        sequence_signature="1:ENG|2:S1",
        sequence_hash="a" * 64,
        idempotency_key="k1-recent",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    res = client.get(f"/api/v1/train-services/{service.id}/recent-sequences?limit=3")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["normalized_sequence"] == ["ENG", "S1"]
    assert rows[0]["station_code"] == "RPT1"
