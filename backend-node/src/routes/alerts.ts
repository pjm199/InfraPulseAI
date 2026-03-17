/**
 * Alert routes: list (Clerk auth, filtered by clerkOrgId).
 */

import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/**
 * GET /api/alerts
 * For frontend. Requires Clerk auth. Returns alerts for req.authContext.clerkOrgId.
 */
export async function listAlerts(req: Request, res: Response): Promise<void> {
  const ctx = req.authContext;
  if (!ctx) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const limit = Math.min(Number(req.query.limit) || 100, 500);

  try {
    const alerts = await prisma.alert.findMany({
      where: { clerkOrgId: ctx.clerkOrgId },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        device: {
          select: { id: true, hostname: true, ip: true, status: true },
        },
      },
    });
    res.json(alerts);
  } catch (e) {
    console.error("Alerts list error:", e);
    res.status(500).json({ error: "Failed to list alerts." });
  }
}
