/**
 * Write Prometheus file_sd targets from registered devices.
 * - Linux (no "windows" tag): node-exporter on port 9100.
 * - Windows (tag "windows"): windows-exporter on port 9182.
 * Single file with mixed groups; Prometheus uses relabel to filter by job.
 */

import type { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const TARGETS_FILE = process.env.PROMETHEUS_TARGETS_FILE ?? "";
const WINDOWS_EXPORTER_PORT = 9182;
const NODE_EXPORTER_PORT = 9100;
/** When set (e.g. to your PC's IP), that device's target uses host.docker.internal so Prometheus in Docker can scrape the host. */
const DOCKER_HOST_IP = process.env.PROMETHEUS_DOCKER_HOST_IP ?? "";

function getTargetsPath(): string {
  if (!TARGETS_FILE) return "";
  return path.isAbsolute(TARGETS_FILE) ? TARGETS_FILE : path.resolve(process.cwd(), TARGETS_FILE);
}

export async function updatePrometheusTargets(prisma: PrismaClient): Promise<void> {
  const filePath = getTargetsPath();
  if (!filePath) return;

  try {
    const devices = await prisma.device.findMany({
      where: { status: { not: "down" } },
      select: { ip: true, hostname: true, tags: true },
    });

    const targetGroups = devices.flatMap((d) => {
      const isWindows = (d.tags ?? []).includes("windows");
      const port = isWindows ? WINDOWS_EXPORTER_PORT : NODE_EXPORTER_PORT;
      const job = isWindows ? "windows-exporter" : "node-exporter";
      const host = DOCKER_HOST_IP && d.ip.trim() === DOCKER_HOST_IP.trim()
        ? "host.docker.internal"
        : d.ip;
      return [
        {
          targets: [`${host}:${port}`],
          labels: {
            job,
            host: d.hostname,
            instance: d.hostname,
          },
        },
      ];
    });

    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, JSON.stringify(targetGroups, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write Prometheus targets file:", e);
  }
}
