"""
Query Prometheus for CPU, memory, and disk metrics over the last N hours.
Supports Node Exporter (Linux) and Windows Exporter (Windows).
"""
from datetime import datetime, timedelta, timezone

import requests

from app.config import settings


def _query_range(prometheus_url: str, query: str, start: datetime, end: datetime, step: str = "300s") -> list[tuple[float, str]]:
    """Run Prometheus range query; return list of (timestamp, value) for the first series."""
    url = f"{prometheus_url.rstrip('/')}/api/v1/query_range"
    params = {
        "query": query,
        "start": start.timestamp(),
        "end": end.timestamp(),
        "step": step,
    }
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "success" or not data.get("data", {}).get("result"):
        return []
    series = data["data"]["result"][0]
    return [(float(t), v) for t, v in series.get("values", [])]


def _instance_labels(hostname: str, ip: str, port: int) -> list[str]:
    """Prometheus instance label: file_sd uses hostname; may also appear as ip:port."""
    labels = [f'instance="{hostname}"']
    if ip:
        labels.append(f'instance="{ip}:{port}"')
    return labels


def _fetch_node_metrics(base_url: str, hostname: str, ip: str, start: datetime, end: datetime, step: str) -> dict:
    """Try Node Exporter (Linux) metrics. Returns dict with cpu, memory, disk lists (may be empty)."""
    result = {"cpu": [], "memory": [], "disk": []}
    instance_labels = _instance_labels(hostname, ip, 9100)
    for instance_re in instance_labels:
        if result["cpu"] and result["memory"] and result["disk"]:
            break
        if not result["cpu"]:
            try:
                q = f'1 - avg by (instance) (rate(node_cpu_seconds_total{{mode="idle",{instance_re}}}[5m]))'
                vals = _query_range(base_url, q, start, end, step)
                result["cpu"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
            except Exception:
                pass
        if not result["memory"]:
            try:
                q = f'1 - (node_memory_MemAvailable_bytes{{{instance_re}}} / node_memory_MemTotal_bytes{{{instance_re}}})'
                vals = _query_range(base_url, q, start, end, step)
                result["memory"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
            except Exception:
                pass
        if not result["disk"]:
            try:
                q = f'1 - (node_filesystem_avail_bytes{{{instance_re},mountpoint="/"}} / node_filesystem_size_bytes{{{instance_re},mountpoint="/"}})'
                vals = _query_range(base_url, q, start, end, step)
                result["disk"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
            except Exception:
                pass
    return result


def _fetch_windows_metrics(base_url: str, hostname: str, ip: str, start: datetime, end: datetime, step: str) -> dict:
    """Try Windows Exporter metrics (CPU, memory, logical disk C:)."""
    result = {"cpu": [], "memory": [], "disk": []}
    instance_labels = _instance_labels(hostname, ip, 9182)
    for instance_re in instance_labels:
        if result["cpu"] and result["memory"] and result["disk"]:
            break
        if not result["cpu"]:
            try:
                # windows_cpu_time_total mode=idle; usage = 1 - rate(idle)
                q = f'1 - avg by (instance) (rate(windows_cpu_time_total{{mode="idle",{instance_re}}}[5m]))'
                vals = _query_range(base_url, q, start, end, step)
                result["cpu"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
            except Exception:
                pass
        if not result["memory"]:
            for total_metric in ("windows_memory_physical_total_bytes", "windows_cs_physical_memory_bytes"):
                try:
                    q = f'1 - (windows_memory_available_bytes{{{instance_re}}} / {total_metric}{{{instance_re}}})'
                    vals = _query_range(base_url, q, start, end, step)
                    result["memory"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
                    break
                except Exception:
                    continue
        if not result["disk"]:
            try:
                # Logical disk C: (or first volume)
                q = f'1 - (windows_logical_disk_free_bytes{{{instance_re},volume="C:"}} / windows_logical_disk_size_bytes{{{instance_re},volume="C:"}})'
                vals = _query_range(base_url, q, start, end, step)
                result["disk"] = [(t, round(float(v) * 100, 2)) for t, v in vals]
            except Exception:
                pass
    return result


def fetch_cpu_memory_disk_for_devices(devices: list[dict], lookback_hours: int = None) -> dict[str, dict]:
    """
    For each device (id, hostname, ip, tags?), query Prometheus for CPU, memory, disk.
    Tries Node Exporter (Linux) first, then Windows Exporter if device has tag "windows".
    Return a dict: device_id -> { hostname, ip, cpu: [(ts, pct)], memory: [...], disk: [...] }
    """
    lookback_hours = lookback_hours or settings.metrics_lookback_hours
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=lookback_hours)
    step = "900s"

    base_url = settings.prometheus_url.rstrip("/")
    out: dict[str, dict] = {}

    for d in devices:
        device_id = d["id"]
        hostname = d.get("hostname", "unknown")
        ip = d.get("ip", "")
        tags = d.get("tags") or []
        is_windows = "windows" in tags

        result = {
            "hostname": hostname,
            "ip": ip,
            "cpu": [],
            "memory": [],
            "disk": [],
        }

        if is_windows:
            # Try Windows Exporter first when device is tagged "windows"
            win_res = _fetch_windows_metrics(base_url, hostname, ip, start, end, step)
            result["cpu"] = win_res["cpu"]
            result["memory"] = win_res["memory"]
            result["disk"] = win_res["disk"]
        else:
            # Linux: try Node Exporter first
            node_res = _fetch_node_metrics(base_url, hostname, ip, start, end, step)
            result["cpu"] = node_res["cpu"]
            result["memory"] = node_res["memory"]
            result["disk"] = node_res["disk"]

        # If still no data: try the other exporter (e.g. Windows PC added without tag, or Linux with different instance)
        if (not result["cpu"] or not result["memory"] or not result["disk"]):
            other = _fetch_windows_metrics if not is_windows else _fetch_node_metrics
            other_res = other(base_url, hostname, ip, start, end, step)
            if other_res["cpu"]:
                result["cpu"] = other_res["cpu"]
            if other_res["memory"]:
                result["memory"] = other_res["memory"]
            if other_res["disk"]:
                result["disk"] = other_res["disk"]

        out[device_id] = result

    return out
