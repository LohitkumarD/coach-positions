from __future__ import annotations

import json
import time
from datetime import timedelta

from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import models, transaction
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from django_ratelimit.decorators import ratelimit
from rest_framework.views import APIView

from ops.forms import UserRegistrationForm
from ops.models import (
    AlertEvent,
    AuditEvent,
    ConfidenceBand,
    ConflictCase,
    ConflictStatus,
    DecisionSnapshot,
    DeviceToken,
    NotificationDelivery,
    TrainService,
    CoachSubmission,
    UserProfile,
    UserRole,
)
from ops.permissions import IsContributorOrAbove, IsSupervisorOrAdmin
from ops.serializers import (
    AlertEventSerializer,
    CoachSubmissionSerializer,
    ConflictCaseSerializer,
    DecisionExplainSerializer,
    DeviceTokenSerializer,
    TrainServiceCreateSerializer,
    TrainServiceBoardSerializer,
)
from ops.services.alerts import maybe_create_composition_change_alert
from ops.services.notifier import PushNotifier
from ops.services.reliability import apply_reliability_updates
from ops.services.gemini_scan import scan_image
from ops.services.scoring import recalculate_candidates


def _create_audit(actor, action, entity_type, entity_id, payload):
    AuditEvent.objects.create(
        actor=actor if actor and actor.is_authenticated else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        payload=payload,
    )


@ratelimit(key="ip", rate="5/h", method="POST", block=True)
def register(request: HttpRequest) -> HttpResponse:
    if not getattr(settings, "ALLOW_OPEN_REGISTRATION", False):
        raise Http404()
    if request.method == "POST" and request.POST.get("company", "").strip():
        return redirect("login")
    if request.method == "POST":
        form = UserRegistrationForm(request.POST)
        if form.is_valid():
            user = form.save()
            _create_audit(
                None,
                "register",
                "user",
                str(user.id),
                {"phone": form.cleaned_data["phone"]},
            )
            messages.success(request, "Account created. Please login.")
            return redirect("login")
    else:
        form = UserRegistrationForm()
    return render(request, "registration/register.html", {"form": form})


class HealthLiveView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request: Request):
        return Response({"status": "ok", "time": timezone.now().isoformat()})


class HealthReadyView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request: Request):
        _ = TrainService.objects.count()
        pending = NotificationDelivery.objects.filter(status__in=["retry", "pending"]).count()
        return Response({"status": "ready", "pendingDeliveries": pending})


class MetricsView(APIView):
    permission_classes = [IsSupervisorOrAdmin]

    def get(self, request: Request):
        now = timezone.now()
        one_hour = now - timedelta(hours=1)
        payload = {
            "submissionsLastHour": TrainService.objects.filter(submissions__submitted_at__gte=one_hour).count(),
            "openConflicts": ConflictCase.objects.filter(status=ConflictStatus.OPEN).count(),
            "criticalAlertsUnacked": AlertEvent.objects.filter(priority="critical", ack_at__isnull=True).count(),
            "notificationQueuePending": NotificationDelivery.objects.filter(status__in=["pending", "retry"]).count(),
        }
        return Response(payload)


class SubmissionCreateView(APIView):
    permission_classes = [IsContributorOrAbove]

    @transaction.atomic
    def post(self, request: Request):
        serializer = CoachSubmissionSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data["errors"]:
            return Response({"errors": serializer.validated_data["errors"]}, status=status.HTTP_400_BAD_REQUEST)
        existing = CoachSubmission.objects.filter(
            submitted_by=request.user,
            idempotency_key=serializer.validated_data["idempotency_key"],
        ).first()
        if existing:
            return Response(
                {
                    "submissionId": existing.id,
                    "trainServiceId": existing.train_service_id,
                    "status": "deduplicated",
                },
                status=status.HTTP_200_OK,
            )
        submission = serializer.save()
        service = submission.train_service
        previous = service.decision_snapshots.order_by("-effective_at").first()
        result = recalculate_candidates(service)
        top = result["top_candidate"]
        runner = result["runner_up"]
        if not top:
            return Response(
                {
                    "message": "No candidate yet — more reports improve confidence.",
                    "submissionId": submission.id,
                    "trainServiceId": service.id,
                    "sequenceSignature": submission.sequence_signature,
                },
                status=status.HTTP_202_ACCEPTED,
            )

        if previous:
            previous.superseded_at = timezone.now()
            previous.save(update_fields=["superseded_at"])
        snapshot = DecisionSnapshot.objects.create(
            train_service=service,
            selected_candidate=top,
            runner_up_candidate=runner,
            confidence_band=result["confidence_band"],
            confidence_score=result["confidence_score"],
            score_delta=result["confidence_score"],
            reason_codes=result["reason_codes"],
            reason_details=result["reason_details"],
        )
        apply_reliability_updates(result["submissions"], final_sequence_hash=top.sequence_hash)

        if result["confidence_band"] == ConfidenceBand.LOW:
            ConflictCase.objects.get_or_create(
                train_service=service,
                status=ConflictStatus.OPEN,
                defaults={
                    "top_candidates": [
                        {"hash": top.sequence_hash, "score": top.final_score, "sequence": top.normalized_sequence},
                        {"hash": runner.sequence_hash if runner else "", "score": runner.final_score if runner else 0.0, "sequence": runner.normalized_sequence if runner else []},
                    ]
                },
            )

        alert = maybe_create_composition_change_alert(service, previous, snapshot)
        if alert:
            users = UserProfile.objects.filter(role__in=[UserRole.SUPERVISOR, UserRole.ADMIN], is_active=True)
            PushNotifier().dispatch_alert(alert, users)

        _create_audit(
            request.user,
            "submission.create",
            "CoachSubmission",
            submission.id,
            {"trainServiceId": service.id, "sequenceHash": submission.sequence_hash},
        )
        return Response(
            {
                "submissionId": submission.id,
                "trainServiceId": service.id,
                "sequenceSignature": submission.sequence_signature,
                "decisionId": snapshot.id,
                "confidenceBand": snapshot.confidence_band,
                "confidenceScore": snapshot.confidence_score,
                "reasonCodes": snapshot.reason_codes,
            },
            status=status.HTTP_201_CREATED,
        )


class SubmissionScanImageView(APIView):
    permission_classes = [IsContributorOrAbove]
    parser_classes = [MultiPartParser]

    def post(self, request: Request):
        image = request.FILES.get("image")
        if not image:
            return Response({"error": "No image provided"}, status=status.HTTP_400_BAD_REQUEST)
        if image.size > 5 * 1024 * 1024:
            return Response({"error": "File too large (max 5MB)"}, status=status.HTTP_400_BAD_REQUEST)
        mime = image.content_type or "image/jpeg"
        image_type = (request.POST.get("image_type") or "unknown").strip() or "unknown"
        result = scan_image(image.read(), mime, image_type if image_type != "unknown" else None)
        if "error" in result:
            err = result.get("error", "")
            code = result.get("code", "")
            if code == "missing_api_key":
                return Response(result, status=status.HTTP_503_SERVICE_UNAVAILABLE)
            if code == "quota_exceeded":
                return Response(result, status=status.HTTP_429_TOO_MANY_REQUESTS)
            if code == "auth_error":
                return Response(result, status=status.HTTP_401_UNAUTHORIZED)
            if code == "model_not_found":
                return Response(result, status=status.HTTP_400_BAD_REQUEST)
            if "Invalid AI response format" in err or code == "invalid_response":
                return Response(result, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
            return Response(result, status=status.HTTP_502_BAD_GATEWAY)
        return Response(result)


class TrainServiceRecentSequencesView(APIView):
    permission_classes = [IsContributorOrAbove]

    def get(self, request: Request, pk: int):
        limit = min(max(int(request.query_params.get("limit", 3)), 1), 10)
        if not TrainService.objects.filter(id=pk).exists():
            return Response({"error": "Train service not found"}, status=status.HTTP_404_NOT_FOUND)
        rows = (
            CoachSubmission.objects.filter(train_service_id=pk)
            .select_related("report_station")
            .order_by("-submitted_at")[:limit]
        )
        payload = [
            {
                "normalized_sequence": s.normalized_sequence,
                "submitted_at": s.submitted_at.isoformat(),
                "station_code": s.report_station.code if s.report_station else None,
            }
            for s in rows
        ]
        return Response(payload)


class TrainCompositionSearchView(APIView):
    """Search trains by number; returns last update time, reporter phone, station from latest submission."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request):
        q = (request.query_params.get("q") or "").strip()
        limit = min(max(int(request.query_params.get("limit", 50)), 1), 100)
        if len(q) >= 2:
            qs = TrainService.objects.filter(train_no__icontains=q).order_by("-journey_date", "-id")[:limit]
        elif len(q) == 1:
            qs = TrainService.objects.filter(train_no__startswith=q).order_by("-journey_date", "-id")[:limit]
        else:
            qs = TrainService.objects.all().order_by("-journey_date", "-id")[:limit]
        out = []
        for ts in qs:
            sub = (
                CoachSubmission.objects.filter(train_service=ts)
                .select_related("submitted_by", "report_station")
                .order_by("-submitted_at")
                .first()
            )
            snap = (
                DecisionSnapshot.objects.filter(train_service=ts)
                .select_related("selected_candidate")
                .order_by("-effective_at")
                .first()
            )
            updated = None
            if snap:
                updated = snap.effective_at
            if sub:
                updated = sub.submitted_at if updated is None else max(updated, sub.submitted_at)
            phone = None
            station_code = None
            if sub:
                station_code = sub.report_station.code if sub.report_station else None
                u = sub.submitted_by
                if u is not None and getattr(u, "phone", None):
                    phone = u.phone
            seq = []
            if snap and snap.selected_candidate:
                seq = snap.selected_candidate.normalized_sequence or []
            out.append(
                {
                    "id": ts.id,
                    "trainNo": ts.train_no,
                    "trainName": ts.train_name or "",
                    "journeyDate": str(ts.journey_date),
                    "lastUpdatedAt": updated.isoformat() if updated else None,
                    "updatedByPhone": phone,
                    "stationCode": station_code,
                    "selectedSequence": seq,
                    "confidenceBand": snap.confidence_band if snap else None,
                }
            )
        return Response(out)


class BoardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request):
        station = request.query_params.get("station")
        window_min = int(request.query_params.get("windowMin", 240))
        now = timezone.now()
        queryset = TrainService.objects.filter(
            models.Q(scheduled_arrival__isnull=True)
            | models.Q(scheduled_arrival__gte=now, scheduled_arrival__lte=now + timedelta(minutes=window_min))
        )
        if station:
            station = station.upper()
            queryset = queryset.filter(
                models.Q(target_station__code=station)
                | models.Q(target_station__isnull=True, submissions__report_station__code=station)
            ).distinct()
        serializer = TrainServiceBoardSerializer(queryset.order_by("scheduled_arrival"), many=True)
        return Response(serializer.data)


class TrainServiceLookupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request):
        q = (request.query_params.get("q") or "").strip()
        station = (request.query_params.get("station") or "").strip().upper()
        limit = min(int(request.query_params.get("limit", 20)), 50)
        now = timezone.now()

        queryset = TrainService.objects.filter(
            models.Q(scheduled_arrival__isnull=True) | models.Q(scheduled_arrival__gte=now - timedelta(hours=1))
        ).select_related("target_station")
        if station:
            queryset = queryset.filter(target_station__code=station)
        if q:
            queryset = queryset.filter(models.Q(train_no__icontains=q) | models.Q(train_name__icontains=q))
        queryset = queryset.order_by("scheduled_arrival")[:limit]

        payload = [
            {
                "id": service.id,
                "trainNo": service.train_no,
                "trainName": service.train_name,
                "journeyDate": str(service.journey_date),
                "targetStation": service.target_station.code if service.target_station else None,
                "scheduledArrival": service.scheduled_arrival.isoformat() if service.scheduled_arrival else None,
            }
            for service in queryset
        ]
        return Response(payload)


class TrainServiceCreateView(APIView):
    permission_classes = [IsContributorOrAbove]

    def post(self, request: Request):
        serializer = TrainServiceCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = serializer.save()
        _create_audit(
            request.user,
            "train_service.create",
            "TrainService",
            service.id,
            {
                "trainNo": service.train_no,
                "journeyDate": str(service.journey_date),
                "targetStation": service.target_station.code if service.target_station else None,
            },
        )
        return Response(
            {
                "id": service.id,
                "trainNo": service.train_no,
                "trainName": service.train_name,
                "journeyDate": str(service.journey_date),
                "targetStation": service.target_station.code if service.target_station else None,
                "scheduledArrival": service.scheduled_arrival.isoformat() if service.scheduled_arrival else None,
            },
            status=status.HTTP_201_CREATED,
        )


@login_required
@require_GET
def board_stream_view(request: HttpRequest):
    station = request.GET.get("station", "")

    def event_stream():
        last_id = None
        while True:
            latest = (
                DecisionSnapshot.objects.filter(train_service__target_station__code=station.upper())
                .select_related("train_service", "selected_candidate")
                .order_by("-effective_at")
                .first()
            )
            if latest and latest.id != last_id:
                payload = {
                    "decisionId": latest.id,
                    "trainNo": latest.train_service.train_no,
                    "sequence": latest.selected_candidate.normalized_sequence,
                    "confidence": latest.confidence_band,
                    "updatedAt": latest.effective_at.isoformat(),
                }
                last_id = latest.id
                yield f"data: {json.dumps(payload)}\n\n"
            else:
                yield "event: heartbeat\ndata: {}\n\n"
            time.sleep(8)

    response = StreamingHttpResponse(event_stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    return response


class ConflictListView(generics.ListAPIView):
    permission_classes = [IsSupervisorOrAdmin]
    serializer_class = ConflictCaseSerializer

    def get_queryset(self):
        station = self.request.query_params.get("station")
        queryset = ConflictCase.objects.filter(status__in=[ConflictStatus.OPEN, ConflictStatus.LOCKED]).select_related("train_service")
        if station:
            queryset = queryset.filter(train_service__target_station__code=station.upper())
        return queryset.order_by("train_service__scheduled_arrival")


class ConflictResolveView(APIView):
    permission_classes = [IsSupervisorOrAdmin]

    def post(self, request: Request, pk: int):
        conflict = get_object_or_404(ConflictCase, pk=pk)
        conflict.status = ConflictStatus.RESOLVED
        conflict.resolved_at = timezone.now()
        conflict.resolved_by = request.user
        conflict.resolution_note = request.data.get("resolutionNote", "")
        conflict.save(update_fields=["status", "resolved_at", "resolved_by", "resolution_note"])
        _create_audit(request.user, "conflict.resolve", "ConflictCase", conflict.id, {"note": conflict.resolution_note})
        return Response({"status": "resolved"})


class ConflictOverrideView(APIView):
    permission_classes = [IsSupervisorOrAdmin]

    @transaction.atomic
    def post(self, request: Request, pk: int):
        conflict = get_object_or_404(ConflictCase, pk=pk)
        candidate_hash = request.data.get("candidateHash")
        reason = request.data.get("reason", "").strip()
        if not candidate_hash or not reason:
            return Response({"detail": "candidateHash and reason required"}, status=status.HTTP_400_BAD_REQUEST)
        candidate = conflict.train_service.candidates.filter(sequence_hash=candidate_hash).first()
        if not candidate:
            return Response({"detail": "candidate not found"}, status=status.HTTP_404_NOT_FOUND)
        latest = conflict.train_service.decision_snapshots.order_by("-effective_at").first()
        if latest:
            latest.superseded_at = timezone.now()
            latest.save(update_fields=["superseded_at"])
        DecisionSnapshot.objects.create(
            train_service=conflict.train_service,
            selected_candidate=candidate,
            runner_up_candidate=None,
            confidence_band=ConfidenceBand.MEDIUM,
            confidence_score=2.0,
            score_delta=2.0,
            reason_codes=["SUPERVISOR_OVERRIDE"],
            reason_details={"reason": reason},
        )
        conflict.status = ConflictStatus.RESOLVED
        conflict.resolved_at = timezone.now()
        conflict.resolved_by = request.user
        conflict.resolution_note = reason
        conflict.save()
        _create_audit(request.user, "conflict.override", "ConflictCase", conflict.id, {"candidateHash": candidate_hash, "reason": reason})
        return Response({"status": "overridden"})


class ConflictLockView(APIView):
    permission_classes = [IsSupervisorOrAdmin]

    def post(self, request: Request, pk: int):
        conflict = get_object_or_404(ConflictCase, pk=pk)
        minutes = int(request.data.get("minutes", 20))
        conflict.status = ConflictStatus.LOCKED
        conflict.locked_until = timezone.now() + timedelta(minutes=minutes)
        conflict.resolution_note = request.data.get("reason", "Temporarily locked for verification")
        conflict.resolved_by = request.user
        conflict.save(update_fields=["status", "locked_until", "resolution_note", "resolved_by"])
        _create_audit(request.user, "conflict.lock", "ConflictCase", conflict.id, {"minutes": minutes, "reason": conflict.resolution_note})
        return Response({"status": "locked", "lockedUntil": conflict.locked_until.isoformat()})


class AlertListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AlertEventSerializer

    def get_queryset(self):
        cursor = self.request.query_params.get("cursor")
        queryset = AlertEvent.objects.order_by("-created_at")
        if cursor:
            queryset = queryset.filter(id__gt=cursor)
        return queryset


class AlertAcknowledgeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request, pk: int):
        alert = get_object_or_404(AlertEvent, pk=pk)
        if not alert.ack_at:
            alert.ack_by = request.user
            alert.ack_at = timezone.now()
            alert.save(update_fields=["ack_by", "ack_at"])
        return Response({"status": "acknowledged", "ackAt": alert.ack_at.isoformat()})


class DecisionExplainView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request, train_service_id: int):
        latest = (
            DecisionSnapshot.objects.select_related("selected_candidate")
            .filter(train_service_id=train_service_id)
            .order_by("-effective_at")
            .first()
        )
        if not latest:
            return Response({"detail": "decision not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(DecisionExplainSerializer(latest).data)


class ContributorScoreboardView(APIView):
    permission_classes = [IsSupervisorOrAdmin]

    def get(self, request: Request):
        station = request.query_params.get("station")
        users = UserProfile.objects.filter(is_active=True).exclude(role=UserRole.VIEWER)
        if station:
            users = users.filter(home_station__code=station.upper())
        users = users.order_by("-reliability_score", "-reliability_events")[:100]
        payload = [
            {
                "userId": user.id,
                "username": user.username,
                "role": user.role,
                "station": user.home_station.code if user.home_station else None,
                "reliabilityScore": round(user.reliability_score, 4),
                "reliabilityEvents": user.reliability_events,
            }
            for user in users
        ]
        return Response(payload)


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request: Request):
        u = request.user
        return Response(
            {
                "username": u.username,
                "role": u.role,
                "roleDisplay": dict(UserRole.choices).get(u.role, u.role),
                "homeStation": u.home_station.code if u.home_station else None,
                "isSupervisor": u.role in (UserRole.SUPERVISOR, UserRole.ADMIN),
            }
        )


class DeviceTokenRegisterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request: Request):
        serializer = DeviceTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj, _ = DeviceToken.objects.update_or_create(
            token=serializer.validated_data["token"],
            defaults={"user": request.user, "platform": serializer.validated_data.get("platform", "webpush"), "is_active": True},
        )
        return Response({"id": obj.id, "status": "registered"})


@login_required
@require_GET
def board_page(request: HttpRequest) -> HttpResponse:
    return render(request, "ops/board.html")


@login_required
@require_GET
def more_page(request: HttpRequest) -> HttpResponse:
    return render(request, "ops/more.html")


@login_required
@require_GET
def supervisor_page(request: HttpRequest) -> HttpResponse:
    if request.user.role not in {UserRole.SUPERVISOR, UserRole.ADMIN}:
        return JsonResponse({"detail": "forbidden"}, status=403)
    return render(request, "ops/supervisor_conflicts.html")


@login_required
@require_GET
def submit_page(request: HttpRequest) -> HttpResponse:
    return render(request, "ops/submit.html")
