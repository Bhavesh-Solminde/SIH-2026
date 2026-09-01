from bhaav_aiml.geo import haversine_km, implied_kmph

VASAI = (19.3919, 72.8397)
NALASOPARA = (19.4176, 72.8562)


def test_haversine_known_short_hop():
    km = haversine_km(VASAI, NALASOPARA)
    assert 3.2 < km < 3.5


def test_haversine_none_when_missing():
    assert haversine_km(VASAI, (None, None)) is None


def test_implied_speed_floor_matches_the_js_seam():
    # A same-instant pair uses the 0.01-hour floor, exactly like SERVER.md D7
    kmph = implied_kmph(
        VASAI, NALASOPARA, "2026-09-02T10:00:00+05:30", "2026-09-02T10:00:00+05:30"
    )
    assert kmph > 300
