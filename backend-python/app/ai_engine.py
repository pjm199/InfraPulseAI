"""
OpenAI-based diagnostic engine: analyze time-series trends, detect anomalies,
forecast issues (e.g. OOM, disk full). Returns structured findings for alerting.
"""
import json
import re
from typing import Any

from openai import OpenAI

from app.config import settings

SYSTEM_PROMPT = """You are a senior infrastructure diagnostic engineer. You analyze time-series metrics (CPU, memory, disk) from multiple servers over the last several hours.

Your job is to:
1. Identify trends (e.g. "Memory usage increasing linearly by ~5% per hour").
2. Detect anomalies (sudden spikes, sustained high usage).
3. Forecast problems (e.g. "At current trend, disk will be full in ~4 hours" or "Memory growth suggests OOM risk in 2–3 hours").
4. Do NOT rely only on static thresholds; reason about rates of change and trajectories.

You will receive JSON with one object per device: hostname, ip, and arrays of [timestamp, value] for cpu_pct, memory_pct, disk_pct (percentages 0–100).

Respond with valid JSON only, in this exact shape (no markdown, no extra text):
{
  "summary": "One paragraph overall assessment.",
  "findings": [
    {
      "device_id": "<id>",
      "hostname": "<hostname>",
      "severity": "info" | "warning" | "critical",
      "message": "Human-readable finding (e.g. trend, forecast, anomaly).",
      "is_predictive": true | false
    }
  ]
}
- Use "critical" for imminent failure (e.g. disk full in <2h, OOM predicted).
- Use "warning" for concerning trends or medium-term risk.
- Use "info" for minor observations.
- Set is_predictive to true when the finding is a forecast, not just current state.
- Include only findings that warrant attention (no "all normal" filler).
- device_id must match the "id" field from the input for each device."""


def _metrics_to_prompt_payload(metrics_by_device: dict[str, dict], device_id_to_org: dict[str, str]) -> str:
    """Build a compact JSON string of metrics for the LLM."""
    payload = []
    for device_id, data in metrics_by_device.items():
        entry = {
            "id": device_id,
            "hostname": data.get("hostname", "unknown"),
            "ip": data.get("ip", ""),
            "cpu_pct": data.get("cpu", [])[-24:],  # last 24 points (~6h at 15min)
            "memory_pct": data.get("memory", [])[-24:],
            "disk_pct": data.get("disk", [])[-24:],
        }
        payload.append(entry)
    return json.dumps(payload, indent=2)


def analyze_and_predict(
    metrics_by_device: dict[str, dict],
    device_id_to_org: dict[str, str],
) -> tuple[str, list[dict[str, Any]]]:
    """
    Call OpenAI with metrics payload. Returns (summary, list of findings).
    Each finding has: device_id, hostname, severity, message, is_predictive.
    """
    if not settings.openai_api_key:
        return "OpenAI API key not configured.", []

    client = OpenAI(api_key=settings.openai_api_key)
    payload_str = _metrics_to_prompt_payload(metrics_by_device, device_id_to_org)

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Analyze these metrics and return only the JSON object.\n\n{payload_str}"},
        ],
        temperature=0.2,
    )
    text = (response.choices[0].message.content or "").strip()
    # Strip markdown code block if present
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return f"LLM response was not valid JSON: {text[:200]}", []

    summary = data.get("summary", "")
    findings = data.get("findings", [])
    if not isinstance(findings, list):
        return summary, []
    return summary, findings
