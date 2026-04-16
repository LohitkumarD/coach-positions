import pytest
from rest_framework.test import APIClient

from ops.models import ConflictCase, ConflictStatus


@pytest.mark.django_db
def test_supervisor_can_resolve_conflict(user_factory, train_service_factory):
    service = train_service_factory()
    supervisor = user_factory(username="sup1", role="supervisor")
    conflict = ConflictCase.objects.create(train_service=service, status=ConflictStatus.OPEN)
    client = APIClient()
    client.force_authenticate(user=supervisor)
    res = client.post(f"/api/v1/conflicts/{conflict.id}/resolve", {"resolutionNote": "Checked with station"}, format="json")
    assert res.status_code == 200
    conflict.refresh_from_db()
    assert conflict.status == ConflictStatus.RESOLVED
