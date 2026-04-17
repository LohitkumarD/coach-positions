from __future__ import annotations

from django.utils import timezone
from rest_framework import serializers

from ops.models import (
    AlertEvent,
    CoachSubmission,
    ConflictCase,
    DecisionSnapshot,
    DeviceToken,
    SourceType,
    Station,
    TrainService,
    RouteStopRank,
)
from ops.services.decision_publish import active_decision_snapshot
from ops.services.normalization import normalize_sequence
from ops.services.train_service_resolve import resolve_train_service_for_submission


class CoachSubmissionSerializer(serializers.Serializer):
    train_service_id = serializers.IntegerField(required=False, allow_null=True)
    train_no = serializers.CharField(max_length=12, required=False, allow_blank=True)
    journey_date = serializers.DateField(required=False, allow_null=True)
    train_name = serializers.CharField(max_length=180, required=False, allow_blank=True)
    source_type = serializers.ChoiceField(choices=SourceType.choices)
    report_station_code = serializers.CharField(max_length=8, required=False, allow_blank=True)
    sequence_input = serializers.CharField()
    idempotency_key = serializers.CharField(max_length=64)
    raw_text = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        ts_id = attrs.get("train_service_id")
        tn = (attrs.get("train_no") or "").strip()
        if ts_id is not None:
            try:
                attrs["train_service"] = TrainService.objects.get(id=ts_id)
            except TrainService.DoesNotExist as exc:
                raise serializers.ValidationError("Train service not found") from exc
        elif tn:
            jd = attrs.get("journey_date")
            try:
                attrs["train_service"] = resolve_train_service_for_submission(
                    tn,
                    jd,
                    (attrs.get("train_name") or "").strip(),
                )
            except ValueError as exc:
                raise serializers.ValidationError(str(exc)) from exc
        else:
            raise serializers.ValidationError(
                "Provide train_service_id (from the list) or train_no with your coach sequence."
            )
        code = (attrs.get("report_station_code") or "").strip()
        if not code:
            attrs["report_station"] = None
        else:
            try:
                attrs["report_station"] = Station.objects.get(code=code.upper())
            except Station.DoesNotExist as exc:
                raise serializers.ValidationError("Station code not found") from exc
        normalized, errors, signature, digest = normalize_sequence(attrs["sequence_input"])
        attrs["normalized"] = normalized
        attrs["errors"] = errors
        attrs["signature"] = signature
        attrs["digest"] = digest
        return attrs

    def create(self, validated_data):
        return CoachSubmission.objects.create(
            train_service=validated_data["train_service"],
            submitted_by=self.context["request"].user,
            source_type=validated_data["source_type"],
            report_station=validated_data["report_station"],
            raw_text=validated_data.get("raw_text", ""),
            normalized_sequence=validated_data["normalized"],
            sequence_signature=validated_data["signature"],
            sequence_hash=validated_data["digest"],
            is_valid=not validated_data["errors"],
            validation_errors=validated_data["errors"],
            idempotency_key=validated_data["idempotency_key"],
        )


class TrainServiceBoardSerializer(serializers.ModelSerializer):
    selected_sequence = serializers.SerializerMethodField()
    selected_signature = serializers.SerializerMethodField()
    confidence_band = serializers.SerializerMethodField()
    confidence_score = serializers.SerializerMethodField()
    last_updated_at = serializers.SerializerMethodField()
    source_summary = serializers.SerializerMethodField()

    class Meta:
        model = TrainService
        fields = [
            "id",
            "train_no",
            "train_name",
            "journey_date",
            "scheduled_arrival",
            "selected_sequence",
            "selected_signature",
            "confidence_band",
            "confidence_score",
            "last_updated_at",
            "source_summary",
        ]

    def _latest(self, obj: TrainService):
        return active_decision_snapshot(obj)

    def get_selected_sequence(self, obj):
        latest = self._latest(obj)
        return latest.selected_candidate.normalized_sequence if latest else []

    def get_selected_signature(self, obj):
        latest = self._latest(obj)
        return latest.selected_candidate.sequence_signature if latest else ""

    def get_confidence_band(self, obj):
        latest = self._latest(obj)
        return latest.confidence_band if latest else "low"

    def get_confidence_score(self, obj):
        latest = self._latest(obj)
        return latest.confidence_score if latest else 0.0

    def get_last_updated_at(self, obj):
        latest = self._latest(obj)
        return latest.effective_at if latest else None

    def get_source_summary(self, obj):
        qs = obj.submissions.select_related("report_station").order_by("-submitted_at")[:8]
        reports = [
            {"station": x.report_station.code if x.report_station else None, "sourceType": x.source_type}
            for x in qs
        ]
        unique_stations = []
        seen = set()
        for x in qs:
            c = x.report_station.code if x.report_station else None
            if c and c not in seen:
                seen.add(c)
                unique_stations.append(c)
        return {
            "reports": reports,
            "uniqueStationCodes": unique_stations[:6],
            "totalReports": obj.submissions.count(),
        }


class ConflictCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConflictCase
        fields = "__all__"


class AlertEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlertEvent
        fields = "__all__"


class DecisionExplainSerializer(serializers.ModelSerializer):
    selected_sequence = serializers.SerializerMethodField()
    selected_signature = serializers.SerializerMethodField()
    support_count = serializers.SerializerMethodField()

    class Meta:
        model = DecisionSnapshot
        fields = [
            "id",
            "confidence_band",
            "confidence_score",
            "score_delta",
            "reason_codes",
            "reason_details",
            "effective_at",
            "selected_sequence",
            "selected_signature",
            "support_count",
        ]

    def get_selected_sequence(self, obj: DecisionSnapshot):
        return obj.selected_candidate.normalized_sequence

    def get_selected_signature(self, obj: DecisionSnapshot):
        return obj.selected_candidate.sequence_signature

    def get_support_count(self, obj: DecisionSnapshot) -> int:
        c = obj.selected_candidate
        return int(c.support_count) if c else 0


class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ["token", "platform"]


class TrainServiceCreateSerializer(serializers.Serializer):
    train_no = serializers.CharField(max_length=12)
    train_name = serializers.CharField(max_length=180, required=False, allow_blank=True)
    journey_date = serializers.DateField(required=False)
    origin_station_code = serializers.CharField(max_length=8, required=False, allow_blank=True)
    destination_station_code = serializers.CharField(max_length=8, required=False, allow_blank=True)
    target_station_code = serializers.CharField(max_length=8, required=False, allow_blank=True)
    scheduled_arrival = serializers.DateTimeField(required=False, allow_null=True)
    scheduled_departure = serializers.DateTimeField(required=False, allow_null=True)
    route_station_codes = serializers.ListField(
        child=serializers.CharField(max_length=8),
        required=False,
        allow_empty=True,
    )

    def _get_or_create_station(self, code: str) -> Station:
        code = code.strip().upper()
        station, _ = Station.objects.get_or_create(
            code=code,
            defaults={
                "name": code,
                "division": "UNKNOWN",
                "zone": "UNKNOWN",
                "is_active": True,
            },
        )
        return station

    def create(self, validated_data):
        origin_code = (validated_data.get("origin_station_code") or "").strip().upper()
        destination_code = (validated_data.get("destination_station_code") or "").strip().upper()
        target_code = (validated_data.get("target_station_code") or "").strip().upper()

        origin = self._get_or_create_station(origin_code) if origin_code else None
        destination = self._get_or_create_station(destination_code) if destination_code else None
        target = self._get_or_create_station(target_code) if target_code else None
        journey_date = validated_data.get("journey_date") or timezone.localdate()

        service, _ = TrainService.objects.get_or_create(
            train_no=validated_data["train_no"].strip(),
            journey_date=journey_date,
            target_station=target,
            defaults={
                "train_name": validated_data.get("train_name", "").strip(),
                "origin_station": origin,
                "destination_station": destination,
                "scheduled_arrival": validated_data.get("scheduled_arrival"),
                "scheduled_departure": validated_data.get("scheduled_departure"),
            },
        )

        # Ensure route ranks (origin -> ... -> destination) for proximity scoring.
        route_codes = [c.strip().upper() for c in validated_data.get("route_station_codes", []) if c.strip()]
        if not route_codes:
            route_codes = [x for x in [origin_code, target_code, destination_code] if x]
        deduped_codes = []
        for code in route_codes:
            if code not in deduped_codes:
                deduped_codes.append(code)
        RouteStopRank.objects.filter(train_service=service).delete()
        for idx, code in enumerate(deduped_codes, start=1):
            station = self._get_or_create_station(code)
            RouteStopRank.objects.create(train_service=service, station=station, rank=idx)

        return service
