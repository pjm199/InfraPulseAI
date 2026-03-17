/**
 * InfraPulse auth middleware.
 * - Browser/frontend: Clerk JWT (req.auth.orgId).
 * - Edge ingestion: x-api-key header → resolve to clerkOrgId via ApiKey table.
 */

import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "@clerk/express";
import { createHash } from "crypto";
import { prisma } from "../lib/prisma.js";

const API_KEY_HEADER = "x-api-key";

export type AuthContext = {
  clerkOrgId: string;
  authMethod: "clerk" | "api_key";
};

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

/**
 * Hash API key for storage/lookup (deterministic).
 */
export function hashApiKey(plain: string): string {
  return createHash("sha256").update(plain.trim()).digest("hex");
}

/**
 * Resolve x-api-key to clerkOrgId. Used for ingestion routes (e.g. POST /api/devices/register).
 * Expects API key in header; returns 401 if missing or invalid.
 */
export async function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const raw = req.headers[API_KEY_HEADER];
  const key =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  if (!key?.trim()) {
    res.status(401).json({
      error: "Missing or invalid x-api-key header (required for device registration).",
    });
    return;
  }

  const keyHash = hashApiKey(key);
  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash },
    select: { clerkOrgId: true },
  });

  if (!apiKey) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }

  req.authContext = {
    clerkOrgId: apiKey.clerkOrgId,
    authMethod: "api_key",
  };
  next();
}

/**
 * After requireAuth(), set authContext from Clerk's req.auth (orgId).
 * Use as second middleware: app.get("/api/devices", requireClerkAuth, withClerkOrg, devicesHandler)
 */
export function withClerkOrg(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const auth = (req as Request & { auth?: { orgId?: string } }).auth;
  const orgId = auth?.orgId;

  if (!orgId) {
    res.status(403).json({
      error: "No organization context. Sign in with an organization or pass a valid x-api-key.",
    });
    return;
  }

  req.authContext = {
    clerkOrgId: orgId,
    authMethod: "clerk",
  };
  next();
}
