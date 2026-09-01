"""Typed request/response mirrors of AI.md section 11. Validation is light and
explicit: a missing field is a bad request, not a silent None that a detector
later divides by."""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class Flag:
    detector_code: str
    subject_type: str  # LOT | HANDOVER | RECYCLER | COLLECTOR | MARKET
    subject_id: str
    severity: str  # INFO | WARN | CRITICAL
    detail: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Skip:
    code: str
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {"code": self.code, "reason": self.reason}


@dataclass
class DetectResponse:
    run_id: str
    config_version: str
    detectors_run: list[str] = field(default_factory=list)
    detectors_skipped: list[Skip] = field(default_factory=list)
    flags: list[Flag] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "config_version": self.config_version,
            "detectors_run": self.detectors_run,
            "detectors_skipped": [s.to_dict() for s in self.detectors_skipped],
            "flags": [f.to_dict() for f in self.flags],
        }


@dataclass
class Context:
    """Everything a detector may read. Built once per request from the body;
    detectors never reach outside it, which is what keeps the service stateless
    (AI-ANOMALY-SPEC section 1 rule 1)."""

    as_of: str
    categories: list[dict]
    recyclers: list[dict]
    rates: list[dict]
    lots: list[dict]
    acceptances: list[dict]
    handovers: list[dict]

    @classmethod
    def from_request(cls, body: dict) -> "Context":
        return cls(
            as_of=body["as_of"],
            categories=body.get("categories", []),
            recyclers=body.get("recyclers", []),
            rates=body.get("rates", []),
            lots=body.get("lots", []),
            acceptances=body.get("acceptances", []),
            handovers=body.get("handovers", []),
        )

    # Convenience joins the detectors lean on.
    def lot_by_id(self) -> dict[str, dict]:
        return {lot["id"]: lot for lot in self.lots}

    def acceptance_by_lot(self) -> dict[str, dict]:
        return {a["lot_id"]: a for a in self.acceptances}
