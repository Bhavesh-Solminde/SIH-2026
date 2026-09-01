"""Tests for POST /detect — M06."""


def base_request():
    return {
        "run_id": "run-1",
        "as_of": "2026-09-02T18:00:00+05:30",
        "categories": [],
        "recyclers": [],
        "rates": [],
        "lots": [],
        "acceptances": [],
        "handovers": [],
    }


def test_detect_returns_200(client):
    res = client.post("/detect", json=base_request())
    assert res.status_code == 200


def test_detect_response_has_required_keys(client):
    res = client.post("/detect", json=base_request()).json()
    assert "flags" in res
    assert "detectors_skipped" in res
    assert "detectors_run" in res


def test_detect_is_deterministic(client):
    req = base_request()
    a = client.post("/detect", json=req).json()
    b = client.post("/detect", json=req).json()
    assert a == b  # same input, same output (AI.md section 11 rule 3)


def test_detect_echoes_the_run_id_and_config_version(client):
    res = client.post("/detect", json=base_request()).json()
    assert res["run_id"] == "run-1"
    assert res["config_version"]


def test_detect_reports_skipped_detectors_with_reasons(client):
    res = client.post("/detect", json=base_request()).json()
    codes = {s["code"] for s in res["detectors_skipped"]}
    assert "D4" in codes and "D5" in codes  # always out of scope, always with a reason
    for s in res["detectors_skipped"]:
        assert s["reason"]


def test_detect_flags_map_onto_the_anomaly_flag_columns(client):
    req = base_request()
    req["lots"] = [
        {
            "id": "l1",
            "collector_id": "c1",
            "category_id": "cat1",
            "quantity": 3.0,
            "condition": "GOOD",
            "collection_lat": 19.0,
            "collection_lng": 72.8,
            "collection_ts": "2026-09-02T10:00:00+05:30",
        }
    ]
    req["acceptances"] = [
        {"id": "a1", "lot_id": "l1", "recycler_id": "r1", "accepted_rate": 420}
    ]
    req["handovers"] = [
        {
            "id": "h1",
            "lot_id": "l1",
            "recycler_id": "r1",
            "final_unit_price": 300,
            "handover_lat": 21.0,
            "handover_lng": 75.0,
            "handover_ts": "2026-09-02T10:30:00+05:30",
            "status": "CONFIRMED",
        }
    ]
    res = client.post("/detect", json=req).json()
    assert len(res["flags"]) >= 1
    for f in res["flags"]:
        assert set(f.keys()) == {"detector_code", "subject_type", "subject_id", "severity", "detail"}


def test_detect_fail_open_returns_200_even_with_empty_data(client):
    """Fail-open contract: always HTTP 200, never 500, even when all detectors skip."""
    req = base_request()
    res = client.post("/detect", json=req)
    assert res.status_code == 200
