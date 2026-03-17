/**
 * Seed API key for edge device registration.
 * Run: npx tsx prisma/seed.ts
 * Or add an API key manually via a script that hashes the key and inserts into ApiKey.
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashKey(plain: string): string {
  return createHash("sha256").update(plain.trim()).digest("hex");
}

async function main() {
  const clerkOrgId = process.env.CLERK_ORG_ID || "org_placeholder";
  const rawKey = process.env.TENANT_API_KEY || "change-me-in-production";

  const keyHash = hashKey(rawKey);
  await prisma.apiKey.upsert({
    where: { keyHash },
    create: {
      clerkOrgId,
      keyHash,
      name: "Seed API key (replace CLERK_ORG_ID and TENANT_API_KEY)",
    },
    update: { clerkOrgId, name: "Seed API key (updated)" },
  });
  console.log("API key seeded for org:", clerkOrgId);
  console.log("Use TENANT_API_KEY (same value) in install.sh on edge nodes.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
