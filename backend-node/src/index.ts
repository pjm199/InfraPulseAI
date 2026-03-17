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

app.use(cors({ origin: true }));
app.use(express.json());

app.use(clerkMiddleware());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "infrapulse-api" });
});

app.post("/api/devices/register", requireApiKey, registerDevice);
app.get("/api/devices", requireAuth(), withClerkOrg, listDevices);
app.get("/api/alerts", requireAuth(), withClerkOrg, listAlerts);

app.listen(PORT, () => {
  console.log(`InfraPulse API listening on port ${PORT}`);
  updatePrometheusTargets(prisma).catch((e) =>
    console.error("Prometheus targets sync failed:", e)
  );
});
