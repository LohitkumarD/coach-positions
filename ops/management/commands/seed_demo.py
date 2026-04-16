from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from ops.models import RouteStopRank, Station, TrainService


class Command(BaseCommand):
    help = "Seed demo station/train data for local verification."

    def handle(self, *args, **options):
        today = timezone.localdate()

        stations = [
            ("DVG", "Davangere", "MYS", "SWR"),
            ("RNR", "Ranebennur", "MYS", "SWR"),
            ("UBL", "Hubballi", "UBL", "SWR"),
            ("SBC", "Bengaluru City", "BNC", "SWR"),
        ]
        station_map = {}
        for code, name, division, zone in stations:
            station, _ = Station.objects.get_or_create(
                code=code,
                defaults={"name": name, "division": division, "zone": zone, "is_active": True},
            )
            station_map[code] = station

        service, created = TrainService.objects.get_or_create(
            train_no="17307",
            journey_date=today,
            target_station=station_map["SBC"],
            defaults={
                "train_name": "MYS EXPRESS",
                "origin_station": station_map["DVG"],
                "destination_station": station_map["SBC"],
                "scheduled_arrival": timezone.now() + timedelta(hours=2),
                "scheduled_departure": timezone.now() + timedelta(hours=2, minutes=5),
            },
        )

        route = [("DVG", 1), ("RNR", 2), ("UBL", 3), ("SBC", 4)]
        for code, rank in route:
            RouteStopRank.objects.get_or_create(
                train_service=service,
                station=station_map[code],
                defaults={"rank": rank},
            )

        if created:
            self.stdout.write(self.style.SUCCESS("Demo service seeded: 17307"))
        else:
            self.stdout.write(self.style.SUCCESS("Demo service already present; route ranks ensured"))
