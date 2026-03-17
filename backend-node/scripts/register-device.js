/**
 * Register a device with the InfraPulse API (same as install.sh, but for manual add).
 * Use this to add your Windows PC or any host that doesn't run the Linux install script.
 *
 * Run from backend-node (so .env is loaded):
 *   npm run register-device -- <hostname> <ip> [windows]
 *
 * Examples:
 *   npm run register-device -- DESKTOP-ABC123 192.168.1.50
 *   npm run register-device -- DESKTOP-ABC123 192.168.1.50 windows
 *
 * With "windows" as third argument, the device is tagged so Prometheus scrapes Windows Exporter (port 9182).
 * Env (from backend-node/.env): TENANT_API_KEY, and optionally INFRA_PULSE_URL (default http://localhost:3000).
 */

const hostname = process.argv[2];
const ip = process.argv[3];
const isWindows = (process.argv[4] || '').toLowerCase() === 'windows';

if (!hostname || !ip) {
  console.error('Usage: npm run register-device -- <hostname> <ip> [windows]');
  console.error('Example: npm run register-device -- DESKTOP-ABC 192.168.1.100 windows');
  process.exit(1);
}

const baseUrl = (process.env.INFRA_PULSE_URL || 'http://localhost:3000').replace(/\/$/, '');
const apiKey = process.env.TENANT_API_KEY;
if (!apiKey) {
  console.error('TENANT_API_KEY is not set (e.g. in backend-node/.env).');
  process.exit(1);
}

const url = `${baseUrl}/api/devices/register`;
const body = JSON.stringify({
  hostname: hostname.trim(),
  ip: ip.trim(),
  ...(isWindows ? { tags: ['windows'] } : {}),
});

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
  },
  body,
})
  .then((res) => {
    if (!res.ok) {
      return res.text().then((t) => {
        throw new Error(`HTTP ${res.status}: ${t}`);
      });
    }
    return res.json();
  })
  .then((data) => {
    console.log('Device registered:', data.hostname, data.ip, '→', data.id);
    if (data.message) console.log(data.message);
  })
  .catch((err) => {
    console.error('Failed to register device:', err.message);
    process.exit(1);
  });
