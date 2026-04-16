from __future__ import annotations

from dataclasses import dataclass

from django.db import transaction

from ops.models import CoachSubmission, UserProfile


@dataclass
class ReliabilityConfig:
    baseline: float = 0.5
    reward: float = 0.03
    penalty: float = 0.04
    min_events_for_penalty: int = 5
    decay_factor: float = 0.995
    min_score: float = 0.05
    max_score: float = 0.99


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


@transaction.atomic
def apply_reliability_updates(
    submissions: list[CoachSubmission],
    final_sequence_hash: str,
    config: ReliabilityConfig | None = None,
) -> None:
    cfg = config or ReliabilityConfig()
    for submission in submissions:
        user: UserProfile = submission.submitted_by
        score = user.reliability_score * cfg.decay_factor
        if submission.sequence_hash == final_sequence_hash:
            score += cfg.reward
        elif user.reliability_events >= cfg.min_events_for_penalty:
            score -= cfg.penalty
        user.reliability_events += 1
        user.reliability_score = _clamp(score, cfg.min_score, cfg.max_score)
        user.save(update_fields=["reliability_events", "reliability_score"])
