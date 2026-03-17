/**
 * Device routes: register (API key) and list (Clerk).
 */

import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { updatePrometheusTargets } from "../lib/prometheus-targets.js";

/**
 * POST /api/devices/register
 * Used by install.sh. Requires x-api-key. Body: { hostname, ip, nodeExporterPort? }.
 * Optional body.clerkOrgId: if provided, must match the API key's org.
 */
export async function registerDevice(req: Request, res: Response): Promise<void> {
  const ctx = req.authContext;
  if (!ctx) {
    res.status(401).json({ error: "Not authenticated (missing auth context)." });
    return;
  }

  const { hostname, ip, nodeExporterPort = 9100, clerkOrgId: bodyOrgId, tags: bodyTags } = req.body as {
    hostname?: string;
    ip?: string;
    nodeExporterPort?: number;
    clerkOrgId?: string;
    tags?: string[];
  };

  if (!hostname?.trim() || !ip?.trim()) {
    res.status(400).json({
      error: "Missing required fields: hostname, ip.",
    });
    return;
  }

  if (bodyOrgId && bodyOrgId !== ctx.clerkOrgId) {
    res.status(403).json({
      error: "clerkOrgId in body does not match the API key's organization.",
    });
    return;
  }

  try {
    const existing = await prisma.device.findFirst({
      where: {
        clerkOrgId: ctx.clerkOrgId,
        hostname: hostname.trim(),
        ip: ip.trim(),
      },
    });

    const tags = Array.isArray(bodyTags) ? bodyTags.filter((t): t is string => typeof t === "string") : [];
    const device = existing
      ? await prisma.device.update({
          where: { id: existing.id },
          data: { updatedAt: new Date(), ...(tags.length ? { tags } : {}) },
        })
      : await prisma.device.create({
          data: {
            hostname: hostname.trim(),
            ip: ip.trim(),
            status: "unknown",
            clerkOrgId: ctx.clerkOrgId,
            tags,
          },
        });

    res.status(existing ? 200 : 201).json({
      id: device.id,
      hostname: device.hostname,
      ip: device.ip,
      status: device.status,
      message: "Device registered. Prometheus targets updated.",
    });

    updatePrometheusTargets(prisma).catch((err) =>
      console.error("Prometheus targets update failed:", err)
    );
  } catch (e) {
    console.error("Device register error:", e);
    res.status(500).json({ error: "Failed to register device." });
  }
}

/**
 * GET /api/devices
 * For frontend. Requires Clerk auth. Returns devices for req.authContext.clerkOrgId.
 */
export async function listDevices(req: Request, res: Response): Promise<void> {
  const ctx = req.authContext;
  if (!ctx) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  try {
    const devices = await prisma.device.findMany({
      where: { clerkOrgId: ctx.clerkOrgId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        hostname: true,
        ip: true,
        status: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json(devices);
  } catch (e) {
    console.error("Devices list error:", e);
    res.status(500).json({ error: "Failed to list devices." });
  }
}
