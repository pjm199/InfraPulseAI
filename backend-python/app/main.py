"""
InfraPulse Python API: predictive worker + POST /api/chat + GET /api/metrics.
"""
import logging
import os

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from app.chat import chat
from app.config import settings
from app.prometheus_fetcher import fetch_cpu_memory_disk_for_devices
from app.worker import run_worker_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="InfraPulse AI", version="1.0.0")


@app.on_event("startup")
def startup() -> None:
    if os.environ.get("RUN_WORKER", "1") == "1":
        run_worker_loop()
    else:
        logger.info("Background worker disabled (RUN_WORKER=0)")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "infrapulse-ai"}


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


def require_internal_access(x_internal_api_token: str = Header(default=""), x_clerk_org_id: str = Header(default="")) -> str:
    if not settings.internal_api_token or x_internal_api_token != settings.internal_api_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not x_clerk_org_id:
        raise HTTPException(status_code=403, detail="Missing organization context")
    return x_clerk_org_id


@app.post("/internal/chat", response_model=ChatResponse)
def api_chat(body: ChatRequest, clerk_org_id: str = Header(alias="x-clerk-org-id"), x_internal_api_token: str = Header(default="")) -> ChatResponse:
    require_internal_access(x_internal_api_token, clerk_org_id)
    reply = chat(body.message, clerk_org_id)
    return ChatResponse(reply=reply)


@app.get("/internal/metrics")
def api_metrics(
    clerk_org_id: str = Header(alias="x-clerk-org-id"),
    x_internal_api_token: str = Header(default=""),
    hostname: str = Query(..., description="Device hostname (matches Prometheus instance label)"),
    ip: str = Query("", description="Device IP (optional)"),
    tags: str = Query("", description="Comma-separated tags, e.g. 'windows' so backend tries Windows Exporter"),
) -> dict:
    """Return latest CPU, memory, disk % for one device in the authenticated tenant."""
    require_internal_access(x_internal_api_token, clerk_org_id)
    tags_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    devices = [d for d in fetch_devices(clerk_org_id) if d["hostname"] == hostname]
    if not devices:
        raise HTTPException(status_code=404, detail="Device not found")
    data = fetch_cpu_memory_disk_for_devices(devices, lookback_hours=1)
    out = data.get("current", {})
    cpu = out.get("cpu") or []
    memory = out.get("memory") or []
    disk = out.get("disk") or []
    return {
        "hostname": hostname,
        "cpu_pct": round(cpu[-1][1], 1) if cpu else None,
        "memory_pct": round(memory[-1][1], 1) if memory else None,
        "disk_pct": round(disk[-1][1], 1) if disk else None,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
