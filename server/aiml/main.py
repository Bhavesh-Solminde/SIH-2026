from fastapi import FastAPI
from bhaav_aiml.config import IN_SCOPE, CONFIG_VERSION

app = FastAPI(title="Bhaav AI/ML")


@app.get("/health")
def health():
    return {"status": "ok", "detectors": IN_SCOPE, "config_version": CONFIG_VERSION}


# /detect and /simulate are added in tasks 6 and 8.
