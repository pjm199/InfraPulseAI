"""PostgreSQL access: devices and alerts. Uses same schema as Node backend (Prisma)."""
import uuid
from contextlib import contextmanager
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor

from app.config import settings


def get_connection():
    return psycopg2.connect(settings.database_url, cursor_factory=RealDictCursor)


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    finally:
        conn.close()


def fetch_devices(clerk_org_id: str | None = None) -> list[dict[str, Any]]:
    """Return all registered devices (id, hostname, ip, status, clerk_org_id, tags)."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT id, hostname, ip, status, "clerkOrgId" AS clerk_org_id, tags
            FROM "Device"
            WHERE status != 'down'
              AND (%s IS NULL OR "clerkOrgId" = %s)
            ORDER BY "updatedAt" DESC
            """,
            (clerk_org_id, clerk_org_id),
        )
        rows = cur.fetchall()
        out = []
        for row in rows:
            d = dict(row)
            if d.get("tags") is None:
                d["tags"] = []
            out.append(d)
        return out


def fetch_recent_alerts(limit: int = 50, clerk_org_id: str | None = None) -> list[dict[str, Any]]:
    """Return recent alerts with device hostname/ip."""
    with db_cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.message, a.severity, a."isPredictive" AS is_predictive, a.timestamp,
                   d.hostname, d.ip
            FROM "Alert" a
            JOIN "Device" d ON d.id = a."deviceId"
            WHERE (%s IS NULL OR a."clerkOrgId" = %s)
            ORDER BY a.timestamp DESC
            LIMIT %s
            """,
            (clerk_org_id, clerk_org_id, limit),
        )
        return [dict(row) for row in cur.fetchall()]


def insert_alert(device_id: str, clerk_org_id: str, message: str, severity: str, is_predictive: bool) -> str:
    """Insert an alert and return its id."""
    alert_id = str(uuid.uuid4())
    with db_cursor() as cur:
        cur.execute(
            """
            INSERT INTO "Alert" (id, "deviceId", "clerkOrgId", message, severity, "isPredictive", timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """,
            (alert_id, device_id, clerk_org_id, message, severity, is_predictive),
        )
    return alert_id
