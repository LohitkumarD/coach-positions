from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.utils import timezone

from ops.models import (
    CandidateComposition,
    CoachSubmission,
    ConfidenceBand,
    RouteStopRank,
    SourceType,
    TrainService,
)

SOURCE_WEIGHT = {
    SourceType.PHYSICAL_CHECK: 5.0,
    SourceType.TTE_ONBOARD: 4.0,
    SourceType.ENROUTE_STATION: 3.0,
    SourceType.ORIGIN_STATION: 2.0,
    SourceType.FORWARDED_MESSAGE: 1.0,
}


@dataclass
class ScoreThresholds:
    high_delta: float = 3.0
    medium_delta: float = 1.5
    minimum_support: int = 2


def _freshness_score(submitted_at):
    age = timezone.now() - submitted_at
    if age < timedelta(minutes=10):
        return 2.0
    if age < timedelta(minutes=30):
        return 1.0
    if age < timedelta(hours=1):
        return 0.4
    return 0.1


def _proximity_score(service: TrainService, submission: CoachSubmission) -> float:
    if not service.target_station_id:
        return 0.5
    if not submission.report_station_id:
        return 0.5
    try:
        target = RouteStopRank.objects.get(train_service=service, station=service.target_station).rank
        current = RouteStopRank.objects.get(train_service=service, station=submission.report_station).rank
    except RouteStopRank.DoesNotExist:
        return 0.5
    distance = abs(target - current)
    if distance == 0:
        return 3.0
    if distance <= 2:
        return 2.0
    if distance <= 5:
        return 1.0
    return 0.5


def recalculate_candidates(service: TrainService) -> dict[str, Any]:
    submissions = list(service.submissions.select_related("submitted_by", "report_station").order_by("-submitted_at"))
    grouped: dict[str, list[CoachSubmission]] = defaultdict(list)
    for submission in submissions:
        grouped[submission.sequence_signature].append(submission)

    candidates: list[CandidateComposition] = []
    for seq_signature, grouped_submissions in grouped.items():
        seq_hash = grouped_submissions[0].sequence_hash
        freq_score = float(len({s.submitted_by_id for s in grouped_submissions}))
        source_score = sum(SOURCE_WEIGHT.get(s.source_type, 1.0) for s in grouped_submissions) / max(len(grouped_submissions), 1)
        freshness_score = sum(_freshness_score(s.submitted_at) for s in grouped_submissions) / max(len(grouped_submissions), 1)
        proximity_score = sum(_proximity_score(service, s) for s in grouped_submissions) / max(len(grouped_submissions), 1)
        contributor_score = sum(float(s.submitted_by.reliability_score) for s in grouped_submissions) / max(len(grouped_submissions), 1)
        penalty_score = 1.0 if any(not s.is_valid for s in grouped_submissions) else 0.0
        final_score = freq_score + source_score + freshness_score + proximity_score + contributor_score - penalty_score

        candidate, _ = CandidateComposition.objects.update_or_create(
            train_service=service,
            sequence_hash=seq_hash,
            defaults={
                "sequence_signature": seq_signature,
                "normalized_sequence": grouped_submissions[0].normalized_sequence,
                "support_count": len(grouped_submissions),
                "score_breakup": {
                    "freqScore": freq_score,
                    "sourceScore": source_score,
                    "freshnessScore": freshness_score,
                    "proximityScore": proximity_score,
                    "contributorScore": contributor_score,
                    "penaltyScore": penalty_score,
                },
                "final_score": round(final_score, 4),
                "last_evaluated_at": timezone.now(),
            },
        )
        candidates.append(candidate)

    candidates.sort(key=lambda c: c.final_score, reverse=True)
    top = candidates[0] if candidates else None
    runner = candidates[1] if len(candidates) > 1 else None
    delta = (top.final_score - runner.final_score) if top and runner else (top.final_score if top else 0.0)

    thresholds = ScoreThresholds()
    if top is None:
        band = ConfidenceBand.LOW
    elif delta >= thresholds.high_delta and top.support_count >= thresholds.minimum_support:
        band = ConfidenceBand.HIGH
    elif delta >= thresholds.medium_delta:
        band = ConfidenceBand.MEDIUM
    else:
        band = ConfidenceBand.LOW

    reason_codes = []
    if top:
        if top.support_count >= 3:
            reason_codes.append("MAJORITY_MATCH")
        if top.score_breakup.get("proximityScore", 0) >= 2:
            reason_codes.append("NEAR_STATION_SUPPORT")
        if top.score_breakup.get("contributorScore", 0) >= 0.7:
            reason_codes.append("HIGH_RELIABILITY_SUPPORT")
    if runner and delta >= 1:
        reason_codes.append("RUNNER_UP_GAP")

    return {
        "top_candidate": top,
        "runner_up": runner,
        "confidence_band": band,
        "confidence_score": round(delta, 3),
        "reason_codes": reason_codes,
        "reason_details": {
            "topScoreBreakup": top.score_breakup if top else {},
            "runnerUpScoreBreakup": runner.score_breakup if runner else {},
            "scoreDelta": delta,
        },
        "submissions": submissions,
    }
