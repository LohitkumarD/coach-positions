# API Contracts (v1)

## POST `/api/v1/submissions`
Request:
```json
{
  "train_service_id": 101,
  "source_type": "physical_check",
  "report_station_code": "SBC",
  "sequence_input": "ENG GS GS S1 S2 B1 A1 H1 SLRD",
  "idempotency_key": "client-generated-key"
}
```
Response `201`:
```json
{
  "submissionId": 9001,
  "decisionId": 1234,
  "confidenceBand": "high",
  "confidenceScore": 4.5,
  "reasonCodes": ["MAJORITY_MATCH", "RUNNER_UP_GAP"]
}
```

## GET `/api/v1/board?station=SBC&windowMin=240`
Response:
```json
[
  {
    "id": 101,
    "train_no": "17307",
    "train_name": "MYS EX",
    "journey_date": "2026-04-15",
    "scheduled_arrival": "2026-04-15T07:30:00Z",
    "selected_sequence": ["ENG", "GS", "S1", "A1", "SLRD"],
    "confidence_band": "medium",
    "confidence_score": 2.1,
    "last_updated_at": "2026-04-15T06:58:00Z",
    "source_summary": [{"station": "DVG", "sourceType": "enroute_station"}]
  }
]
```

## GET `/api/v1/decisions/{trainServiceId}/explain`
Response includes reason codes and score breakup:
```json
{
  "id": 1234,
  "confidence_band": "high",
  "confidence_score": 4.7,
  "score_delta": 4.7,
  "reason_codes": ["MAJORITY_MATCH", "NEAR_STATION_SUPPORT"],
  "reason_details": {
    "topScoreBreakup": {"freqScore": 3.0},
    "runnerUpScoreBreakup": {},
    "scoreDelta": 4.7
  },
  "selected_sequence": ["ENG", "GS", "S1", "A1", "SLRD"]
}
```
