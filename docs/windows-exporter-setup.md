# Monitor your Windows PC with InfraPulse

To see **CPU, memory, and disk** for your Windows 11 (or other Windows) machine in the dashboard and 3D twin, install **Windows Exporter** and register the device with the `windows` tag.

## 1. Install Windows Exporter

Windows Exporter is the Windows equivalent of Node Exporter: it exposes Prometheus metrics (CPU, memory, disk, network, etc.) on port **9182**.

### Option A: Download the MSI (recommended)

1. Go to [Releases · prometheus-community/windows_exporter](https://github.com/prometheus-community/windows_exporter/releases).
2. Download the latest **amd64** MSI (e.g. `windows_exporter-0.27.0-amd64.msi`).
3. Run the MSI. You can leave defaults; it installs a Windows service that listens on `http://0.0.0.0:9182/metrics`.
4. Open **Services** (`services.msc`), find **windows_exporter**, and ensure it is **Running** and **Automatic**.

### Option B: Chocolatey

```powershell
choco install windows_exporter -y
```

### Option C: Manual (portable)

1. Download the **amd64** `.exe` from the releases page.
2. Run from an elevated prompt (or as a scheduled task / service):

   ```powershell
   .\windows_exporter-amd64.exe
   ```

   To listen on all interfaces (so Prometheus on another host can scrape):

   ```powershell
   .\windows_exporter-amd64.exe --web.listen-address=:9182
   ```

## 2. Firewall (if Prometheus is on another machine)

If your InfraPulse Prometheus runs on a different PC or server, allow inbound TCP **9182** on the Windows machine:

- **Windows Defender Firewall** → Advanced settings → Inbound Rules → New Rule → Port → TCP 9182 → Allow.

Or in PowerShell (run as Administrator):

```powershell
New-NetFirewallRule -DisplayName "Windows Exporter 9182" -Direction Inbound -Protocol TCP -LocalPort 9182 -Action Allow
```

## 3. Register the PC in InfraPulse with the `windows` tag

From your **backend-node** directory (Node API must be running, same org as your other devices):

```powershell
# Get your PC hostname and IP (PowerShell)
$env:COMPUTERNAME
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' }).IPAddress
```

Then:

```bash
cd backend-node
npm run register-device -- YOUR_HOSTNAME YOUR_IP windows
```

Example:

```bash
npm run register-device -- DESKTOP-ABC123 192.168.1.50 windows
```

The `windows` argument adds the tag so that:

- Prometheus scrapes this host on port **9182** (Windows Exporter) instead of 9100 (Node Exporter).
- The Python backend queries Windows Exporter metrics (CPU, memory, disk C:) for this device.

## 4. Verify

1. **On the Windows PC:** Open `http://localhost:9182/metrics` in a browser; you should see Prometheus text metrics.
2. **Register with the `windows` tag** (required so Prometheus scrapes port 9182, not 9100):
   ```bash
   cd backend-node
   npm run register-device -- JOHNDEV101 192.168.1.8 windows
   ```
   If the device already exists, this updates it and rewrites the targets file.
3. **Prometheus runs in Docker on this same PC?** Then from inside the container, `192.168.1.8` is the host and may be unreachable. In `backend-node/.env` set:
   ```env
   PROMETHEUS_DOCKER_HOST_IP=192.168.1.8
   ```
   Restart the Node API so the targets file uses `host.docker.internal:9182` for your PC; then Prometheus in Docker can scrape the host’s Windows Exporter.
4. **Check targets:** Open [Prometheus targets](http://localhost:9090/targets). Your Windows host should appear as a `windows-exporter` target and be **UP**. If it’s **DOWN**, fix firewall or use `PROMETHEUS_DOCKER_HOST_IP` as above.
5. **Dashboard:** Select the Windows device in the 3D twin or device list; the **Live metrics** panel should show CPU %, Memory %, and Disk % (C:) after a scrape or two.

## Metrics used

| Metric | Linux (Node Exporter) | Windows (Windows Exporter) |
|--------|------------------------|-----------------------------|
| CPU    | `node_cpu_seconds_total` (idle) | `windows_cpu_time_total` (idle) |
| Memory | `node_memory_*`                | `windows_memory_available_bytes` / `windows_cs_physical_memory_bytes` |
| Disk   | `node_filesystem_*` (mount `/`) | `windows_logical_disk_*` (volume C:) |

If your Windows Exporter version uses slightly different metric names, the backend may show “—” until we align; open an issue or adjust the queries in `backend-python/app/prometheus_fetcher.py`.
