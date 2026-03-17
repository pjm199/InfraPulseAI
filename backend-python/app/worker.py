"""
Background worker: periodically fetch devices, get Prometheus metrics,
run AI analysis, write alerts and send Telegram for critical/predictive findings.
"""
import logging
import threading
import time
from typing import Dict

from app.ai_engine import analyze_and_predict
from app.alerts import process_findings
from app.config import settings
from app.database import fetch_devices
from app.prometheus_fetcher import fetch_cpu_memory_disk_for_devices

logger = logging.getLogger(__name__)


def _run_one_cycle() -> None:
    try:
        devices = fetch_devices()
        if not devices:
            logger.info("No devices registered; skipping cycle.")
            return
        device_id_to_org: Dict[str, str] = {d["id"]: d["clerk_org_id"] for d in devices}
        metrics = fetch_cpu_memory_disk_for_devices(devices, settings.metrics_lookback_hours)
        if not metrics:
            logger.warning("No metrics fetched for any device.")
            return
        summary, findings = analyze_and_predict(metrics, device_id_to_org)
        logger.info("AI summary: %s", summary[:200] if summary else "none")
        if findings:
            ids = process_findings(findings, device_id_to_org)
            logger.info("Created %d alerts: %s", len(ids), ids)
    except Exception as e:
        logger.exception("Worker cycle failed: %s", e)


def run_worker_loop() -> None:
    """Run the predictive loop in a background thread."""
    interval = max(60, settings.worker_interval_seconds)

    def loop() -> None:
        logger.info("Predictive worker started; interval=%ds", interval)
        while True:
            try:
                _run_one_cycle()
            except Exception as e:
                logger.exception("Worker error: %s", e)
            time.sleep(interval)

    t = threading.Thread(target=loop, daemon=True)
    t.start()
