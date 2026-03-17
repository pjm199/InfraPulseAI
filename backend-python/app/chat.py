"""
Natural language query endpoint: user asks about infrastructure state;
we gather devices, recent metrics, recent alerts and ask OpenAI to answer.
"""
import json
from typing import Any

from openai import OpenAI

from app.config import settings
from app.database import fetch_devices, fetch_recent_alerts
from app.prometheus_fetcher import fetch_cpu_memory_disk_for_devices


def build_context() -> str:
    """Build a text summary of current infrastructure state for the LLM."""
    devices = fetch_devices()
    if not devices:
        return "No devices registered."
    metrics = fetch_cpu_memory_disk_for_devices(devices, lookback_hours=1)
    alerts = fetch_recent_alerts(50)
    lines = [
        "=== Registered devices ===",
        json.dumps([{"id": d["id"], "hostname": d["hostname"], "ip": d["ip"], "status": d["status"]} for d in devices], indent=2),
        "\n=== Recent metrics (last 1h, sample) ===",
    ]
    for did, data in list(metrics.items())[:20]:
        lines.append(f"  {data.get('hostname', did)}: cpu_last={data.get('cpu', [])[-1] if data.get('cpu') else 'N/A'}, mem_last={data.get('memory', [])[-1] if data.get('memory') else 'N/A'}, disk_last={data.get('disk', [])[-1] if data.get('disk') else 'N/A'}")
    lines.append("\n=== Recent alerts (last 50) ===")
    lines.append(json.dumps([{"hostname": a.get("hostname"), "message": a.get("message"), "severity": a.get("severity"), "timestamp": str(a.get("timestamp"))} for a in alerts], indent=2))
    return "\n".join(lines)


def chat(user_message: str) -> str:
    """Answer a natural language question about infrastructure using OpenAI."""
    if not settings.openai_api_key:
        return "OpenAI API key is not configured; cannot answer questions."
    context = build_context()
    client = OpenAI(api_key=settings.openai_api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You are an infrastructure assistant. You have access to the current state: registered devices, recent CPU/memory/disk metrics, and recent alerts. Answer the user's question concisely based only on this context. If the data is empty or insufficient, say so.",
            },
            {"role": "user", "content": f"Current infrastructure state:\n{context}\n\nUser question: {user_message}"},
        ],
        temperature=0.3,
    )
    return (response.choices[0].message.content or "").strip()
