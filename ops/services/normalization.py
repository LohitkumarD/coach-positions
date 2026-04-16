from __future__ import annotations

import hashlib
import re
from typing import Iterable

CANONICAL_MAP = {
    "LOCO": "ENG",
    "ENGINE": "ENG",
    "SLR": "SLRD",
}

TOKEN_PATTERN = re.compile(r"[A-Za-z0-9/-]+")


def enforce_engine_first_after_scan(tokens: list[str]) -> tuple[list[str], list[str]]:
    """
    Post-OCR: coach lists must read engine end → tail. Position 1 must be ENG when a loco appears.

    If ENG appears only at the end, the model likely read tail→engine; reverse the list.
    Otherwise add notes when ENG is missing or not first (no destructive edits except full reverse).
    """
    notes: list[str] = []
    if not tokens:
        return tokens, notes
    if tokens[0] == "ENG":
        return tokens, notes
    if tokens[-1] == "ENG":
        notes.append(
            "Oriented engine-first: ENG was at the end of the line — sequence reversed to engine→tail."
        )
        return list(reversed(tokens)), notes
    if "ENG" in tokens:
        pos = tokens.index("ENG") + 1
        notes.append(
            f"ENG appears at position {pos}, not position 1 — check image direction; position 1 should be engine (ENG)."
        )
    else:
        notes.append(
            "No ENG in extraction — include the locomotive as ENG in position 1 when shown (order: 1=ENG, 2=next coach, …)."
        )
    return tokens, notes


def normalize_sequence(raw_input: str | Iterable[str]) -> tuple[list[str], list[str], str]:
    if isinstance(raw_input, str):
        tokens = TOKEN_PATTERN.findall(raw_input.upper())
    else:
        tokens = [str(t).upper().strip() for t in raw_input if str(t).strip()]

    normalized: list[str] = []
    errors: list[str] = []
    for token in tokens:
        canonical = CANONICAL_MAP.get(token, token)
        if len(canonical) > 12:
            errors.append(f"Token too long: {token}")
            continue
        normalized.append(canonical)

    if not normalized:
        errors.append("Empty sequence")

    signature = "|".join(f"{idx + 1}:{token}" for idx, token in enumerate(normalized))
    digest = hashlib.sha256(signature.encode("utf-8")).hexdigest()
    return normalized, errors, signature, digest
