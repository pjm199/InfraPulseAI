"""Write alerts to PostgreSQL and send critical ones via Telegram."""
import asyncio
from typing import Any

import requests

from app.database import insert_alert
from app.config import settings


def write_alert(device_id: str, clerk_org_id: str, message: str, severity: str, is_predictive: bool) -> str:
    """Insert alert into DB; return new alert id."""
    return insert_alert(device_id, clerk_org_id, message, severity, is_predictive)


def send_telegram(message: str) -> bool:
    """Send message to Telegram; TELEGRAM_CHAT_ID must be set."""
    token = settings.telegram_bot_token
    chat_id = settings.telegram_chat_id
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        r = requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"}, timeout=10)
        return r.status_code == 200
    except Exception:
        return False


def process_findings(
    findings: list[dict[str, Any]],
    device_id_to_org: dict[str, str],
) -> list[str]:
    """
    For each finding: write Alert to DB; if severity is critical or warning and is_predictive, send Telegram.
    Returns list of created alert ids.
    """
    alert_ids = []
    for f in findings:
        device_id = f.get("device_id") or ""
        if not device_id:
            continue
        clerk_org_id = device_id_to_org.get(device_id) or "unknown"
        message = f.get("message") or "No message"
        severity = (f.get("severity") or "info").lower()
        if severity not in ("info", "warning", "critical"):
            severity = "info"
        is_predictive = bool(f.get("is_predictive"))

        aid = write_alert(device_id, clerk_org_id, message, severity, is_predictive)
        alert_ids.append(aid)

        if (severity in ("critical", "warning") and is_predictive) or severity == "critical":
            send_telegram(f"<b>InfraPulse</b> [{severity}]\n{message}")
    return alert_ids
