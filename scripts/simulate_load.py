"""
InfraPulse - Load Simulation Script (Phase 5)

Run on a target node (edge or lab VM) to generate artificial load so that
Prometheus + the AI backend can detect and forecast issues.

Usage examples:

    # Simulate CPU load for 5 minutes
    python simulate_load.py --mode cpu --duration 300

    # Simulate disk fill (write ~2 GB under /tmp/infrapulse-load)
    python simulate_load.py --mode disk --size-gb 2

    # Combine CPU and disk load
    python simulate_load.py --mode both --duration 300 --size-gb 1
"""

from __future__ import annotations

import argparse
import math
import multiprocessing
import os
import signal
import sys
import tempfile
import time
from pathlib import Path
from typing import List


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="InfraPulse load simulator")
  parser.add_argument(
    "--mode",
    choices=["cpu", "disk", "both"],
    default="cpu",
    help="Type of load to generate.",
  )
  parser.add_argument(
    "--duration",
    type=int,
    default=300,
    help="Duration in seconds for CPU load (0 means run until interrupted).",
  )
  parser.add_argument(
    "--size-gb",
    type=float,
    default=1.0,
    help="Approximate GB to write for disk load (per run).",
  )
  parser.add_argument(
    "--disk-path",
    type=str,
    default=str(Path(tempfile.gettempdir()) / "infrapulse-load"),
    help="Directory in which to write temporary load files.",
  )
  parser.add_argument(
    "--cpu-workers",
    type=int,
    default=max(1, multiprocessing.cpu_count() - 1),
    help="Number of CPU worker processes to spawn.",
  )
  return parser.parse_args()


def _cpu_worker(stop_time: float | None) -> None:
  """
  Busy-loop worker. If stop_time is None, runs until killed.
  """
  while True:
    # Simple floating-point operations to keep the core busy
    _ = math.sin(time.time()) * math.cos(time.time())
    if stop_time is not None and time.time() >= stop_time:
      break


def run_cpu_load(duration: int, workers: int) -> None:
  if duration < 0:
    duration = 0
  stop_time = time.time() + duration if duration > 0 else None
  procs: List[multiprocessing.Process] = []
  for _ in range(max(1, workers)):
    p = multiprocessing.Process(target=_cpu_worker, args=(stop_time,))
    p.start()
    procs.append(p)
  try:
    if duration > 0:
      while time.time() < stop_time:  # type: ignore[arg-type]
        time.sleep(0.5)
    else:
      # Run until interrupted
      while True:
        time.sleep(1)
  except KeyboardInterrupt:
    pass
  finally:
    for p in procs:
      if p.is_alive():
        p.terminate()
    for p in procs:
      p.join()


def run_disk_load(size_gb: float, base_path: str) -> None:
  """
  Write a large file (or files) to the given directory to simulate disk pressure.
  Files are left on disk so that disk usage is visible to node_exporter; delete
  the directory manually when done.
  """
  path = Path(base_path)
  path.mkdir(parents=True, exist_ok=True)
  bytes_to_write = int(size_gb * (1024**3))
  chunk = b"0" * (1024 * 1024)  # 1 MiB
  file_path = path / f"load-{int(time.time())}.bin"
  written = 0
  print(f"[simulate_load] Writing ~{size_gb:.2f} GiB to {file_path} ...")
  try:
    with open(file_path, "wb") as f:
      while written < bytes_to_write:
        f.write(chunk)
        written += len(chunk)
        if written % (100 * len(chunk)) == 0:
          print(f"[simulate_load] Written {written / (1024**2):.1f} MiB")
  except KeyboardInterrupt:
    print("[simulate_load] Disk write interrupted by user.")
  except OSError as exc:
    print(f"[simulate_load] Disk write error: {exc}", file=sys.stderr)
  else:
    print("[simulate_load] Disk write complete.")


def main() -> None:
  args = parse_args()
  print(f"[simulate_load] Mode={args.mode}, duration={args.duration}s, size_gb={args.size_gb}")

  if args.mode in ("cpu", "both"):
    print(
      f"[simulate_load] Starting CPU load with {args.cpu_workers} workers "
      f"for {args.duration if args.duration > 0 else '∞'} seconds ...",
    )
    if args.mode == "cpu":
      run_cpu_load(args.duration, args.cpu_workers)
      return
    # For "both", run CPU in a background process so we can also do disk
    cpu_proc = multiprocessing.Process(target=run_cpu_load, args=(args.duration, args.cpu_workers))
    cpu_proc.start()
  else:
    cpu_proc = None

  if args.mode in ("disk", "both"):
    run_disk_load(args.size_gb, args.disk_path)

  if args.mode == "both" and cpu_proc is not None:
    print("[simulate_load] Waiting for CPU workers to finish ...")
    cpu_proc.join()


if __name__ == "__main__":
  main()

