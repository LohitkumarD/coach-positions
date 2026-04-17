from __future__ import annotations

import pytest
from django.core.cache import cache
from django.test import Client, override_settings
from django.urls import reverse

from ops.models import AuditEvent, UserProfile, UserRole

pytestmark = pytest.mark.django_db

REG_PASSWORD = "MyStr0ng!UniquePwdForTests123"


@pytest.fixture(autouse=True)
def _clear_ratelimit_cache():
    cache.clear()
    yield
    cache.clear()


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=False)
def test_registration_success():
    client = Client()
    url = reverse("register")
    phone = "919876543210"
    resp = client.post(
        url,
        {
            "phone": "+91 98765 43210",
            "password1": REG_PASSWORD,
            "password2": REG_PASSWORD,
            "email": "",
            "company": "",
        },
    )
    assert resp.status_code == 302
    assert resp.url == reverse("login")
    user = UserProfile.objects.get(phone="919876543210")
    assert user.username == "919876543210"
    assert user.check_password(REG_PASSWORD)
    assert user.role == UserRole.CONTRIBUTOR
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.is_active is True
    ev = AuditEvent.objects.filter(action="register", entity_type="user", entity_id=str(user.id)).first()
    assert ev is not None
    assert ev.payload.get("phone") == "919876543210"


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=False)
def test_registration_duplicate_phone_rejected():
    client = Client()
    url = reverse("register")
    body = {
        "phone": "919000000001",
        "password1": REG_PASSWORD,
        "password2": REG_PASSWORD,
        "email": "",
        "company": "",
    }
    assert client.post(url, body).status_code == 302
    r2 = client.post(
        url,
        {
            "phone": "919000-000-001",
            "password1": REG_PASSWORD,
            "password2": REG_PASSWORD,
            "email": "",
            "company": "",
        },
    )
    assert r2.status_code == 200
    assert UserProfile.objects.filter(phone="919000000001").count() == 1


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=False)
def test_registration_phone_normalization():
    client = Client()
    url = reverse("register")
    n = UserProfile.objects.count()
    raw = f"+91 8000 {n:06d}"
    expected = f"918000{n:06d}"
    client.post(
        url,
        {
            "phone": raw,
            "password1": REG_PASSWORD,
            "password2": REG_PASSWORD,
            "email": "",
            "company": "",
        },
    )
    assert UserProfile.objects.filter(phone=expected).exists()


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=False)
def test_registration_honeypot_silent():
    before = UserProfile.objects.count()
    client = Client()
    url = reverse("register")
    resp = client.post(
        url,
        {
            "phone": "918888888888",
            "password1": REG_PASSWORD,
            "password2": REG_PASSWORD,
            "email": "",
            "company": "Acme Inc",
        },
    )
    assert resp.status_code == 302
    assert resp.url == reverse("login")
    assert UserProfile.objects.count() == before


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=False)
def test_registration_role_cannot_be_overridden():
    client = Client()
    url = reverse("register")
    client.post(
        url,
        {
            "phone": "917777777777",
            "password1": REG_PASSWORD,
            "password2": REG_PASSWORD,
            "email": "",
            "company": "",
            "role": UserRole.ADMIN,
            "is_staff": "true",
            "is_superuser": "on",
        },
    )
    user = UserProfile.objects.get(phone="917777777777")
    assert user.role == UserRole.CONTRIBUTOR
    assert user.is_staff is False
    assert user.is_superuser is False


@override_settings(ALLOW_OPEN_REGISTRATION=False)
def test_registration_disabled_returns_403():
    client = Client()
    url = reverse("register")
    assert client.get(url).status_code == 403
    assert (
        client.post(url, {"phone": "916666666666", "password1": REG_PASSWORD, "password2": REG_PASSWORD}).status_code
        == 403
    )


@override_settings(ALLOW_OPEN_REGISTRATION=True, RATELIMIT_ENABLE=True)
def test_registration_sixth_post_returns_429():
    client = Client()
    url = reverse("register")
    cache.clear()
    base = {"password1": REG_PASSWORD, "password2": REG_PASSWORD, "email": "", "company": ""}
    for i in range(5):
        data = {**base, "phone": f"915{i:08d}"}
        r = client.post(url, data)
        assert r.status_code == 302, r.content
    r6 = client.post(url, {**base, "phone": "91599999999"})
    assert r6.status_code == 429
