/**
 * InfraPulse Node.js API
 * - Clerk auth for GET /api/devices, GET /api/alerts
 * - x-api-key for POST /api/devices/register (edge ingestion)
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import { requireApiKey, withClerkOrg } from "./middleware/auth.js";
import { registerDevice, listDevices } from "./routes/devices.js";
import { listAlerts } from "./routes/alerts.js";
import { prisma } from "./lib/prisma.js";
import { updatePrometheusTargets } from "./lib/prometheus-targets.js";

const PORT = Number(process.env.PORT) || 3000;

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed by CORS"));
  },
}));
app.use(express.json({ limit: "256kb" }));

app.use(clerkMiddleware());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "infrapulse-api" });
});

app.post("/api/devices/register", requireApiKey, registerDevice);
app.get("/api/devices", requireAuth(), withClerkOrg, listDevices);
app.get("/api/alerts", requireAuth(), withClerkOrg, listAlerts);

// AI service stays private inside the Docker network. The Node API enforces
// Clerk authentication and forwards the tenant context downstream.
app.post("/api/chat", requireAuth(), withClerkOrg, async (req, res) => {
  try {
    const response = await fetch(`${process.env.BACKEND_PYTHON_URL ?? "http://backend-python:8000"}/internal/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-api-token": process.env.INTERNAL_API_TOKEN ?? "",
        "x-clerk-org-id": req.authContext!.clerkOrgId,
      },
      body: JSON.stringify(req.body),
    });
    const body = await response.text();
    res.status(response.status).type("application/json").send(body);
  } catch (error) {
    console.error("AI chat proxy error:", error);
    res.status(502).json({ error: "AI service unavailable." });
  }
});

app.get("/api/metrics", requireAuth(), withClerkOrg, async (req, res) => {
  try {
    const params = new URLSearchParams();
    for (const key of ["hostname", "ip", "tags"]) {
      const value = req.query[key];
      if (typeof value === "string") params.set(key, value);
    }
    const response = await fetch(`${process.env.BACKEND_PYTHON_URL ?? "http://backend-python:8000"}/internal/metrics?${params.toString()}`, {
      headers: {
        "x-internal-api-token": process.env.INTERNAL_API_TOKEN ?? "",
        "x-clerk-org-id": req.authContext!.clerkOrgId,
      },
    });
    const body = await response.text();
    res.status(response.status).type("application/json").send(body);
  } catch (error) {
    console.error("AI metrics proxy error:", error);
    res.status(502).json({ error: "AI service unavailable." });
  }
});

app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", service: "infrapulse-api" });
  } catch {
    res.status(503).json({ status: "not_ready", service: "infrapulse-api" });
  }
});

app.listen(PORT, () => {
  console.log(`InfraPulse API listening on port ${PORT}`);
  updatePrometheusTargets(prisma).catch((e) =>
    console.error("Prometheus targets sync failed:", e)
  );
});
