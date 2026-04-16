import pytest
from django.test import Client


@pytest.mark.django_db
def test_board_stream_accepts_event_stream(user_factory):
    user = user_factory(username="streamuser")
    client = Client()
    client.force_login(user)
    response = client.get(
        "/api/v1/board/stream?station=RNR",
        HTTP_ACCEPT="text/event-stream",
    )
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/event-stream")
