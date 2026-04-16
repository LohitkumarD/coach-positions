from ops.services.normalization import enforce_engine_first_after_scan, normalize_sequence


def test_normalize_sequence_with_aliases():
    normalized, errors, signature, digest = normalize_sequence("engine gs s1 slr")
    assert normalized == ["ENG", "GS", "S1", "SLRD"]
    assert errors == []
    assert signature == "1:ENG|2:GS|3:S1|4:SLRD"
    assert len(digest) == 64


def test_normalize_sequence_empty():
    normalized, errors, _, _ = normalize_sequence("")
    assert normalized == []
    assert "Empty sequence" in errors


def test_enforce_engine_first_reverses_when_eng_last():
    tokens = ["LPR", "GEN", "ENG"]
    fixed, notes = enforce_engine_first_after_scan(tokens)
    assert fixed == ["ENG", "GEN", "LPR"]
    assert any("reversed" in n.lower() for n in notes)


def test_enforce_engine_first_noop_when_eng_first():
    tokens = ["ENG", "GEN", "S1"]
    fixed, notes = enforce_engine_first_after_scan(tokens)
    assert fixed == tokens
    assert notes == []


def test_enforce_engine_first_warns_when_eng_middle():
    tokens = ["GEN", "ENG", "S1"]
    fixed, notes = enforce_engine_first_after_scan(tokens)
    assert fixed == tokens
    assert any("position 2" in n for n in notes)
