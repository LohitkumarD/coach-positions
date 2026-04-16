import pytest
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone

from ops.models import Station, TrainService


@pytest.fixture
def station_factory(db):
    def _make(**kwargs):
        payload = {
            "code": kwargs.pop("code", "DVG"),
            "name": kwargs.pop("name", "Davangere"),
            "division": kwargs.pop("division", "MYS"),
            "zone": kwargs.pop("zone", "SWR"),
            **kwargs,
        }
        return Station.objects.create(**payload)

    return _make


@pytest.fixture
def user_factory(db, station_factory):
    User = get_user_model()

    def _make(**kwargs):
        station = kwargs.pop("home_station", station_factory(code=f"S{User.objects.count()+1}"))
        payload = {
            "username": kwargs.pop("username", f"user{User.objects.count()+1}"),
            "role": kwargs.pop("role", "contributor"),
            "home_station": station,
            **kwargs,
        }
        user = User.objects.create(**payload)
        user.set_password("password123")
        user.save()
        return user

    return _make


@pytest.fixture
def train_service_factory(db, station_factory):
    def _make(**kwargs):
        origin = kwargs.pop("origin_station", station_factory(code=f"O{TrainService.objects.count()+1}"))
        dest = kwargs.pop("destination_station", station_factory(code=f"D{TrainService.objects.count()+1}"))
        target = kwargs.pop("target_station", station_factory(code=f"T{TrainService.objects.count()+1}"))
        payload = {
            "train_no": kwargs.pop("train_no", "17307"),
            "train_name": kwargs.pop("train_name", "TEST EXPRESS"),
            "journey_date": kwargs.pop("journey_date", timezone.localdate()),
            "origin_station": origin,
            "destination_station": dest,
            "target_station": target,
            "scheduled_arrival": kwargs.pop("scheduled_arrival", timezone.now() + timedelta(hours=2)),
            "scheduled_departure": kwargs.pop("scheduled_departure", timezone.now() + timedelta(hours=2, minutes=5)),
            **kwargs,
        }
        return TrainService.objects.create(**payload)

    return _make
