from fastapi import FastAPI
from bhaav_aiml.config import IN_SCOPE, CONFIG_VERSION
from bhaav_aiml.models import Context, DetectResponse
from bhaav_aiml.detectors import run_detectors
from bhaav_aiml.simulate import simulate as run_simulate

app = FastAPI(title="Bhaav AI/ML")


@app.get("/health")
def health():
    return {"status": "ok", "detectors": IN_SCOPE, "config_version": CONFIG_VERSION}


@app.post("/detect")
def detect(body: dict):
    # The service is stateless: everything it needs is in the body. It never
    # writes; the API decides what to persist (AI.md section 11 rules 1-2).
    # Fail-open: run_detectors catches any detector exception and skips that
    # detector — an exception inside a detector must never return HTTP 500.
    ctx = Context.from_request(body)
    flags, ran, skipped = run_detectors(ctx)
    return DetectResponse(
        run_id=body.get("run_id", ""),
        config_version=CONFIG_VERSION,
        detectors_run=ran,
        detectors_skipped=skipped,
        flags=flags,
    ).to_dict()


@app.post("/simulate")
def simulate(body: dict):
    # Everything here is labelled simulated. The response carries simulated:true
    # and ground_truth[] so recall figures are computable and nothing synthetic
    # is ever mistaken for real.
    return run_simulate(body)
