def test_health_lists_the_in_scope_detectors(client):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    for code in ["D1", "D2", "D3", "D6", "D7", "D8", "D9"]:
        assert code in body["detectors"]
