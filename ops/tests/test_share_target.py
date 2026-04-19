import json
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from rest_framework.test import APIClient

from ops.models import IncomingShareImage
from ops.views import _share_token_signer

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_ratelimit_cache():
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


@override_settings(RATELIMIT_ENABLE=False)
def test_incoming_share_post_redirects_to_login_with_next():
    client = Client()
    img = SimpleUploadedFile("a.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF", content_type="image/jpeg")
    res = client.post("/pwa/incoming-share", {"media": img})
    assert res.status_code == 302
    assert "/accounts/login/" in res["Location"]
    assert "share_token=" in res["Location"]
    assert IncomingShareImage.objects.count() == 1


@override_settings(RATELIMIT_ENABLE=False)
def test_incoming_share_no_image_returns_400():
    client = Client()
    res = client.post("/pwa/incoming-share", {})
    assert res.status_code == 400


@override_settings(RATELIMIT_ENABLE=False, PWA_SHARE_INGEST_ENABLED=False)
def test_incoming_share_disabled_returns_503():
    client = Client()
    img = SimpleUploadedFile("a.jpg", b"\xff\xd8\xff\xe0\x00\x10JFIF", content_type="image/jpeg")
    res = client.post("/pwa/incoming-share", {"media": img})
    assert res.status_code == 503


def test_incoming_share_get_returns_405():
    client = Client()
    res = client.get("/pwa/incoming-share")
    assert res.status_code == 405


def test_scan_shared_second_call_returns_404(user_factory, monkeypatch):
    row = IncomingShareImage.objects.create(
        image_data=b"\xff\xd8\xff\xe0\x00\x10JFIF",
        content_type="image/jpeg",
    )
    token = _share_token_signer().sign(str(row.pk))

    def mock_scan(_bytes, _mime, _hint=None):
        return {"extractions": [{"train_number": "1", "coach_sequence_text": "ENG", "normalized_sequence": ["ENG"], "validation_errors": [], "sequence_signature": "1:ENG", "sequence_hash": "a" * 64}]}

    monkeypatch.setattr("ops.views.scan_image", mock_scan)
    client = APIClient()
    client.force_authenticate(user=user_factory())
    assert client.post("/api/v1/submissions/scan-shared", {"token": token}, format="json").status_code == 200
    assert client.post("/api/v1/submissions/scan-shared", {"token": token}, format="json").status_code == 404


def test_scan_shared_mock_success(user_factory, monkeypatch):
    row = IncomingShareImage.objects.create(
        image_data=b"\xff\xd8\xff\xe0\x00\x10JFIF",
        content_type="image/jpeg",
    )
    token = _share_token_signer().sign(str(row.pk))

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
    client = APIClient()
    client.force_authenticate(user=user_factory())
    res = client.post("/api/v1/submissions/scan-shared", {"token": token}, format="json")
    assert res.status_code == 200
    assert res.json()["extractions"][0]["train_number"] == "17307"
    assert IncomingShareImage.objects.count() == 0


def test_scan_shared_invalid_token(user_factory):
    client = APIClient()
    client.force_authenticate(user=user_factory())
    res = client.post("/api/v1/submissions/scan-shared", {"token": "not-a-token"}, format="json")
    assert res.status_code == 400


def test_scan_shared_viewer_forbidden(user_factory):
    from ops.models import UserRole

    row = IncomingShareImage.objects.create(
        image_data=b"\xff\xd8\xff\xe0\x00\x10JFIF",
        content_type="image/jpeg",
    )
    token = _share_token_signer().sign(str(row.pk))
    client = APIClient()
    client.force_authenticate(user=user_factory(role=UserRole.VIEWER))
    res = client.post("/api/v1/submissions/scan-shared", {"token": token}, format="json")
    assert res.status_code == 403


def test_manifest_has_share_target():
    root = Path(__file__).resolve().parents[2]
    raw = (root / "ops" / "static" / "ops" / "manifest.json").read_text(encoding="utf-8")
    data = json.loads(raw)
    assert "share_target" in data
    assert data["share_target"]["action"] == "/pwa/incoming-share"
    assert data["share_target"]["method"] == "POST"
