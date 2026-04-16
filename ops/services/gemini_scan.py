from __future__ import annotations

import json
import re

import google.generativeai as genai
from django.conf import settings

from ops.services.normalization import enforce_engine_first_after_scan, normalize_sequence

PROMPT_V2 = """You are an expert railway coach-composition extractor (Indian Railways style lists, charts, WhatsApp text, and platform displays).

Your task is to read the image and extract each train's coach order from ENGINE end to LAST coach.

CRITICAL RULES:

1. OUTPUT STRICT JSON ONLY. NO MARKDOWN, NO TEXT BEFORE OR AFTER THE JSON.
2. DO NOT INVENT coaches or train numbers. If unreadable, use null and lower confidence.
3. MULTIPLE TRAINS: output one object in "extractions" per distinct train number or column.
4. ORDER: coach_sequence_text MUST follow the same order as printed (engine/first position → last).

FIELD coach_sequence_text:
- Single line, SPACE-separated coach codes in order **position 1 = engine, 2 = next coach toward tail** (e.g. "ENG GEN GEN S1 …" means 1=ENG, 2=GEN, 3=GEN, 4=S1).
- **Position 1 MUST be ENG** (locomotive / engine end). If the chart shows LOCO/WAP/WAG, output **ENG** as the first token.
- Never start with sleeper/brake codes (e.g. LPR, SLRD) unless that is truly the first coach shown at the **engine** end — usually the loco is first; use the "Pos from Eng" or engine-side column.
- Expand ranges and "to" lists into individual codes (see below). No commas unless they appear inside a single token.

FIELD confidence:
- A number from 0.0 to 1.0 only (e.g. 0.85). NOT percent, NOT 1–10.
- Use lower values for blurry crops, glare, or ambiguous digits (6 vs 8, 3 vs 8).

OUTPUT FORMAT:

{
  "extractions": [
    {
      "train_number": "string or null",
      "train_name": "string or null",
      "journey_date": "YYYY-MM-DD or null",
      "coach_sequence_text": "space separated tokens in order",
      "confidence": 0.0,
      "notes": "brief OCR caveats if any"
    }
  ]
}

COACH TYPES (examples):
ENG, SLRD, LSLRD, GEN, GS, S1-S12, B1-B12, A1-A3, HA1, PC, LPR, WRRM, etc.

RANGE EXPANSION:
- "S5 TO S1" or "S5-S1" → S5 S4 S3 S2 S1
- "B1-B5" → B1 B2 B3 B4 B5

TABLES:
- Prefer the column that lists coach order from engine (e.g. "Pos from Eng", first column).

MULTI-COLUMN / MULTI-TRAIN:
- Separate trains when train numbers or blocks differ.

IGNORE:
- Phone numbers, staff names, signatures, stamps, unrelated headers.

NOW EXTRACT.
"""


def _normalize_confidence(raw) -> float | None:
    """Coerce model output to 0..1 float."""
    if raw is None:
        return None
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return None
    if v > 1.0 and v <= 100.0:
        v = v / 100.0
    if v < 0.0 or v > 1.0:
        return None
    return round(v, 4)

# Tried after GEMINI_MODEL. Prefer current aliases; `gemini-2.0-flash` may 404 for new API keys ("no longer available").
_FALLBACK_MODEL_ORDER = (
    "gemini-1.5-flash-latest",
    "gemini-flash-latest",
    "gemini-1.5-pro-latest",
    "gemini-2.0-flash",
)


def _is_model_not_found(exc: BaseException) -> bool:
    s = str(exc).lower()
    if "not supported for generatecontent" in s:
        return True
    if "no longer available" in s or "not available to new users" in s:
        return True
    if "deprecated" in s and "model" in s:
        return True
    if "404" in s and ("not found" in s or "is not found" in s):
        return True
    if "404" in s and "models/gemini-" in s:
        return True
    return False


def _classify_gemini_exception(exc: BaseException) -> str:
    """Return error code for API response mapping."""
    text = f"{type(exc).__name__} {exc!s}".lower()
    if any(
        x in text
        for x in (
            "429",
            "quota",
            "resource exhausted",
            "rate limit",
            "too many requests",
            "limit: 0",
        )
    ):
        return "quota_exceeded"
    if any(x in text for x in ("401", "403", "api key not valid", "permission denied", "invalid api key")):
        return "auth_error"
    if _is_model_not_found(exc):
        return "model_not_found"
    return "gemini_api_error"


def extract_json_object(text: str | None) -> dict | None:
    if not text:
        return None
    cleaned = re.sub(r"```(?:json)?", "", text, flags=re.IGNORECASE).replace("```", "")
    start = cleaned.find("{")
    if start == -1:
        return None
    tail = cleaned[start:]
    try:
        parsed = json.loads(tail)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        try:
            obj, _ = decoder.raw_decode(tail)
            return obj if isinstance(obj, dict) else None
        except json.JSONDecodeError:
            return None


def scan_image(image_bytes: bytes, mime_type: str, image_type_hint: str | None = None) -> dict:
    api_key = (getattr(settings, "GEMINI_API_KEY", "") or "").strip()
    if not api_key:
        return {
            "error": "Gemini is not configured",
            "detail": "Set GEMINI_API_KEY in the environment or .env",
            "code": "missing_api_key",
        }

    configured = (getattr(settings, "GEMINI_MODEL", "") or "").strip() or "gemini-1.5-flash-latest"
    candidates = [configured]
    for m in _FALLBACK_MODEL_ORDER:
        if m not in candidates:
            candidates.append(m)

    genai.configure(api_key=api_key)

    prompt = PROMPT_V2
    if image_type_hint and image_type_hint != "unknown":
        prompt = f"Image type: {image_type_hint.upper()}\n\n" + prompt

    response = None
    last_fail_exc: BaseException | None = None
    last_fail_kind: str | None = None  # "nf" | "quota" — which error the last candidate raised

    def _quota_payload(exc: BaseException) -> dict:
        short = (
            "Google AI quota exceeded or this model is not enabled for your API key. "
            "See https://ai.google.dev/gemini-api/docs/rate-limits — set GEMINI_MODEL to a model "
            "your project can use (e.g. gemini-1.5-flash-latest) or enable billing."
        )
        return {
            "error": "Gemini quota or model access",
            "detail": f"{short}\n\n{str(exc)[:600]}",
            "code": "quota_exceeded",
        }

    for model_name in candidates:
        model = genai.GenerativeModel(model_name)
        try:
            response = model.generate_content(
                [
                    prompt,
                    {"mime_type": mime_type or "image/jpeg", "data": image_bytes},
                ],
                generation_config={
                    "temperature": 0.15,
                    "top_p": 0.9,
                },
            )
            break
        except Exception as exc:
            if _is_model_not_found(exc):
                last_fail_exc, last_fail_kind = exc, "nf"
                continue
            code = _classify_gemini_exception(exc)
            if code == "quota_exceeded":
                # Try next model — quota is often per-model (e.g. limit: 0 on one flash variant).
                last_fail_exc, last_fail_kind = exc, "quota"
                continue
            if code == "auth_error":
                return {
                    "error": "Gemini authentication failed",
                    "detail": str(exc)[:500],
                    "code": code,
                }
            return {
                "error": "Gemini request failed",
                "detail": str(exc)[:500],
                "code": "gemini_api_error",
            }

    if response is None:
        if last_fail_kind == "quota" and last_fail_exc is not None:
            return _quota_payload(last_fail_exc)
        if last_fail_kind == "nf" and last_fail_exc is not None:
            detail = str(last_fail_exc)[:600]
            return {
                "error": "Gemini model not available for this API key or region",
                "detail": detail,
                "code": "model_not_found",
            }
        return {
            "error": "Gemini model not available for this API key or region",
            "detail": "All candidate model IDs failed.",
            "code": "model_not_found",
        }

    raw_text = getattr(response, "text", None) or ""
    data = extract_json_object(raw_text)
    if not data:
        return {"error": "Invalid AI response format", "code": "invalid_response"}

    results = []
    for ext in data.get("extractions", []):
        if not isinstance(ext, dict):
            continue
        raw = ext.get("coach_sequence_text") or ""
        if not isinstance(raw, str):
            raw = ""
        normalized, errors, signature, digest = normalize_sequence(raw)
        normalized, orient_notes = enforce_engine_first_after_scan(normalized)
        errors = list(errors) + orient_notes
        normalized, err2, signature, digest = normalize_sequence(normalized)
        errors = errors + err2
        row = {**ext}
        row["confidence"] = _normalize_confidence(ext.get("confidence"))
        row["normalized_sequence"] = normalized
        row["validation_errors"] = errors
        row["sequence_signature"] = signature
        row["sequence_hash"] = digest
        results.append(row)

    return {"extractions": results}
