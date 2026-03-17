#!/usr/bin/env bash
# InfraPulse Edge Node Installer
# Run on Raspberry Pi or Linux servers to install Node Exporter + Promtail and register with central.
#
# Usage (curl):
#   INFRA_PULSE_URL=https://your-central-server TENANT_API_KEY=your-org-api-key \
#     curl -sSL https://your-central-server/scripts/install.sh | bash
# Or with args:
#   curl -sSL .../install.sh | bash -s -- https://your-central-server
#   (TENANT_API_KEY must be set in env for device registration)
#
# Required for registration: TENANT_API_KEY (Clerk Organization API key; sent as x-api-key header).
# If your key contains ! use single quotes: TENANT_API_KEY='your-key!!' (bash expands !! inside double quotes).
# Optional: CLERK_ORG_ID (if provided, sent in body for validation).
# Requires: curl, (optional) systemd

set -e

# ---------------------------------------------------------------------------
# Configuration (override via env or first argument)
# ---------------------------------------------------------------------------
INFRA_PULSE_URL="${INFRA_PULSE_URL:-${1}}"
if [ -z "$INFRA_PULSE_URL" ]; then
  echo "Usage: INFRA_PULSE_URL=https://CENTRAL_SERVER TENANT_API_KEY=your-api-key curl -sSL <url>/scripts/install.sh | bash"
  echo "   or: curl -sSL <url>/install.sh | bash -s -- https://CENTRAL_SERVER  (with TENANT_API_KEY in env)"
  exit 1
fi

# Strip trailing slash
INFRA_PULSE_URL="${INFRA_PULSE_URL%/}"

# Derive API and Loki URLs (default ports: 3000 for API, 3100 for Loki)
# If INFRA_PULSE_URL has no port, we assume same host with these ports
if echo "$INFRA_PULSE_URL" | grep -qE ':[0-9]+$'; then
  BASE_HOST="$INFRA_PULSE_URL"
  API_URL="$INFRA_PULSE_URL"
  LOKI_URL="${INFRA_PULSE_URL%:*}:3100"
else
  BASE_HOST="$INFRA_PULSE_URL"
  API_URL="${INFRA_PULSE_URL}:3000"
  LOKI_URL="${INFRA_PULSE_URL}:3100"
fi

NODE_EXPORTER_VERSION="${NODE_EXPORTER_VERSION:-1.7.0}"
PROMTAIL_VERSION="${PROMTAIL_VERSION:-2.9.2}"
INSTALL_DIR="${INSTALL_DIR:-/opt/infrapulse}"
BIN_DIR="${INSTALL_DIR}/bin"
CONFIG_DIR="${INSTALL_DIR}/config"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[InfraPulse] $*"; }
err() { echo "[InfraPulse] ERROR: $*" >&2; }
arch_go() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64";;
    aarch64|arm64) echo "arm64";;
    armv7l|armhf) echo "arm";;
    *) echo "amd64";;
  esac
}
# Node Exporter uses armv6/armv7/arm64 (no generic "arm"); Promtail uses arm/armv6/arm64
node_exporter_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64";;
    aarch64|arm64) echo "arm64";;
    armv7l|armhf) echo "armv7";;
    armv6l) echo "armv6";;
    *) echo "amd64";;
  esac
}
os_go() {
  case "$(uname -s)" in
    Linux) echo "linux";;
    *) echo "linux";;
  esac
}

# ---------------------------------------------------------------------------
# Install Node Exporter
# ---------------------------------------------------------------------------
install_node_exporter() {
  if command -v node_exporter >/dev/null 2>&1; then
    log "Node Exporter already installed: $(node_exporter --version 2>&1 | head -1)"
    return 0
  fi

  log "Installing Node Exporter ${NODE_EXPORTER_VERSION}..."
  mkdir -p "$BIN_DIR" "$CONFIG_DIR"
  local ne_arch ne_os
  ne_arch="$(node_exporter_arch)"
  ne_os="$(os_go)"
  local tarball="node_exporter-${NODE_EXPORTER_VERSION}.${ne_os}-${ne_arch}.tar.gz"
  local url="https://github.com/prometheus/node_exporter/releases/download/v${NODE_EXPORTER_VERSION}/${tarball}"
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '$tmpdir'" EXIT
  if ! curl -sSLf "$url" -o "$tmpdir/node_exporter.tar.gz"; then
    err "Failed to download Node Exporter (arch=$ne_arch). Check $url"
    return 1
  fi
  tar -xzf "$tmpdir/node_exporter.tar.gz" -C "$tmpdir"
  cp "$tmpdir/node_exporter-${NODE_EXPORTER_VERSION}.${ne_os}-${ne_arch}/node_exporter" "$BIN_DIR/node_exporter"
  chmod +x "$BIN_DIR/node_exporter"
  rm -rf "$tmpdir"
  trap - EXIT
  log "Node Exporter installed at $BIN_DIR/node_exporter"
}

# ---------------------------------------------------------------------------
# Install Promtail (Grafana provides .zip, not .tar.gz)
# ---------------------------------------------------------------------------
install_promtail() {
  if [ -f "$BIN_DIR/promtail" ] && "$BIN_DIR/promtail" --version >/dev/null 2>&1; then
    log "Promtail already installed."
    return 0
  fi

  if ! command -v unzip >/dev/null 2>&1; then
    err "unzip is required for Promtail. Install it (e.g. apt install unzip) and re-run."
    return 1
  fi

  log "Installing Promtail ${PROMTAIL_VERSION}..."
  mkdir -p "$BIN_DIR" "$CONFIG_DIR"
  local arch
  arch=$(arch_go)
  # Grafana releases: promtail-linux-arm64.zip, promtail-linux-arm.zip, promtail-linux-amd64.zip
  local zipname="promtail-linux-${arch}.zip"
  local url="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/${zipname}"
  local tmpdir
  tmpdir="$(mktemp -d)"
  trap "rm -rf '$tmpdir'" EXIT
  if ! curl -sSLf "$url" -o "$tmpdir/promtail.zip"; then
    log "Trying fallback arch amd64..."
    zipname="promtail-linux-amd64.zip"
    url="https://github.com/grafana/loki/releases/download/v${PROMTAIL_VERSION}/${zipname}"
    curl -sSLf "$url" -o "$tmpdir/promtail.zip"
  fi
  unzip -q -o "$tmpdir/promtail.zip" -d "$tmpdir"
  # Zip may contain single binary (promtail-linux-arm64) or a folder with promtail inside
  if [ -f "$tmpdir/promtail-linux-${arch}" ]; then
    cp "$tmpdir/promtail-linux-${arch}" "$BIN_DIR/promtail"
  elif [ -f "$tmpdir/promtail" ]; then
    cp "$tmpdir/promtail" "$BIN_DIR/promtail"
  else
    cp "$tmpdir/promtail-"*/promtail "$BIN_DIR/promtail" 2>/dev/null || \
      cp "$tmpdir/"*"/promtail" "$BIN_DIR/promtail"
  fi
  chmod +x "$BIN_DIR/promtail"
  rm -rf "$tmpdir"
  trap - EXIT
  log "Promtail installed at $BIN_DIR/promtail"
}

# ---------------------------------------------------------------------------
# Configure Promtail to ship logs to central Loki
# ---------------------------------------------------------------------------
configure_promtail() {
  local hostname
  hostname="$(hostname -s 2>/dev/null || echo 'unknown')"
  local client_url="${LOKI_URL}/loki/api/v1/push"
  log "Configuring Promtail -> $client_url"

  cat > "$CONFIG_DIR/promtail.yml" <<EOF
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: ${INSTALL_DIR}/positions.yaml

clients:
  - url: ${client_url}

scrape_configs:
  - job_name: system
    static_configs:
      - targets:
          - localhost
        labels:
          job: varlogs
          host: ${hostname}
          __path__: /var/log/*.log
  - job_name: journal
    journal:
      path: /var/log/journal
      max_age: 12h
    relabel_configs:
      - source_labels: ['__journal__hostname']
        target_label: host
      - source_labels: ['__journal__hostname']
        target_label: hostname
EOF
  log "Promtail config written to $CONFIG_DIR/promtail.yml"
}

# ---------------------------------------------------------------------------
# Register this node with the central API (requires TENANT_API_KEY)
# ---------------------------------------------------------------------------
register_with_api() {
  local hostname ip payload
  hostname="$(hostname -s 2>/dev/null || echo 'unknown')"
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '127.0.0.1')"
  payload="{\"hostname\":\"${hostname}\",\"ip\":\"${ip}\",\"nodeExporterPort\":9100}"
  if [ -n "${CLERK_ORG_ID:-}" ]; then
    payload="{\"hostname\":\"${hostname}\",\"ip\":\"${ip}\",\"nodeExporterPort\":9100,\"clerkOrgId\":\"${CLERK_ORG_ID}\"}"
  fi
  local api_register="${API_URL}/api/devices/register"
  log "Registering with API: $api_register (hostname=$hostname, ip=$ip)"

  if [ -z "${TENANT_API_KEY:-}" ]; then
    err "TENANT_API_KEY not set. Skipping registration. Set TENANT_API_KEY and run again to register this node."
    return 0
  fi

  if curl -sS -X POST "$api_register" \
    -H "Content-Type: application/json" \
    -H "x-api-key: ${TENANT_API_KEY}" \
    -d "$payload" \
    --connect-timeout 10 --max-time 30; then
    log "Registration request sent successfully."
  else
    err "Registration request failed (check TENANT_API_KEY and API). Register manually: POST $api_register with header x-api-key"
  fi
}

# ---------------------------------------------------------------------------
# Systemd service files (optional)
# ---------------------------------------------------------------------------
install_systemd_services() {
  if ! command -v systemctl >/dev/null 2>&1; then
    log "Systemd not found; skipping service installation. Run binaries manually from $BIN_DIR"
    return 0
  fi

  log "Installing systemd services..."

  cat > /tmp/infrapulse-node_exporter.service <<EOF
[Unit]
Description=InfraPulse Node Exporter
After=network.target

[Service]
Type=simple
ExecStart=${BIN_DIR}/node_exporter --web.listen-address=:9100
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
  sudo cp /tmp/infrapulse-node_exporter.service /etc/systemd/system/
  rm -f /tmp/infrapulse-node_exporter.service

  cat > /tmp/infrapulse-promtail.service <<EOF
[Unit]
Description=InfraPulse Promtail
After=network.target

[Service]
Type=simple
ExecStart=${BIN_DIR}/promtail -config.file=${CONFIG_DIR}/promtail.yml
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
  sudo cp /tmp/infrapulse-promtail.service /etc/systemd/system/
  rm -f /tmp/infrapulse-promtail.service

  sudo systemctl daemon-reload
  sudo systemctl enable infrapulse-node_exporter infrapulse-promtail
  sudo systemctl restart infrapulse-node_exporter infrapulse-promtail
  log "Services enabled and started: infrapulse-node_exporter, infrapulse-promtail"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  log "InfraPulse edge installer — central: $INFRA_PULSE_URL"
  install_node_exporter
  install_promtail
  configure_promtail
  register_with_api
  install_systemd_services
  log "Done. Node Exporter :9100, Promtail logs -> $LOKI_URL"
}

main "$@"
