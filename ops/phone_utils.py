"""Digits-only phone normalization (single policy for storage and lookups)."""

from __future__ import annotations

import re


def normalize_phone(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\D", "", str(value))
