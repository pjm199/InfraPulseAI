import { Suspense, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useAuth } from '@clerk/clerk-react'
import { DigitalTwinScene } from './DigitalTwinScene'

type Device = {
  id: string
  hostname: string
  ip: string
  status: string
  tags: string[]
}

type Alert = {
  id: string
  message: string
  severity: 'info' | 'warning' | 'critical' | string
  isPredictive: boolean
  timestamp: string
  device?: {
    id: string
    hostname: string
    ip: string
    status: string
  }
}

// Use empty string in dev so requests go to same origin and Vite proxy forwards to backends (avoids CORS)
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''
const AI_BASE = import.meta.env.VITE_AI_BASE_URL ?? ''

export function Dashboard() {
  const { getToken } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatReply, setChatReply] = useState<string | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [deviceMetrics, setDeviceMetrics] = useState<{
    cpu_pct: number | null
    memory_pct: number | null
    disk_pct: number | null
  } | null>(null)
  const [metricsError, setMetricsError] = useState(false)
  const [metricsLoading, setMetricsLoading] = useState(false)

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, 10000)
    return () => window.clearInterval(id)
  }, [])

  // Auto-select first device when list loads and nothing is selected
  useEffect(() => {
    if (devices.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(devices[0].id)
    }
  }, [devices, selectedDeviceId])

  async function refresh() {
    try {
      const token = await getToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const [dRes, aRes] = await Promise.all([
        axios.get<Device[]>(`${API_BASE}/api/devices`, { headers }),
        axios.get<Alert[]>(`${API_BASE}/api/alerts`, { headers }),
      ])
      setDevices(dRes.data)
      setAlerts(aRes.data)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch devices/alerts', e)
    }
  }

  const latestAlertByDevice = useMemo(() => {
    const map = new Map<string, Alert>()
    for (const a of alerts) {
      const id = a.device?.id ?? ''
      if (!id) continue
      if (!map.has(id)) {
        map.set(id, a)
      }
    }
    return map
  }, [alerts])

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === selectedDeviceId) ?? null,
    [devices, selectedDeviceId],
  )

  const selectedDeviceAlerts = useMemo(
    () =>
      selectedDeviceId
        ? alerts.filter((a) => a.device?.id === selectedDeviceId).slice(0, 10)
        : [],
    [alerts, selectedDeviceId],
  )

  // Fetch metrics for selected device (from Python /api/metrics on port 8000)
  useEffect(() => {
    if (!selectedDevice) {
      setDeviceMetrics(null)
      setMetricsError(false)
      setMetricsLoading(false)
      return
    }
    setDeviceMetrics(null)
    setMetricsError(false)
    setMetricsLoading(true)
    const deviceId = selectedDevice.id
    const base = AI_BASE || API_BASE
    axios
      .get<{ cpu_pct: number | null; memory_pct: number | null; disk_pct: number | null }>(
        `${base}/api/metrics`,
        {
          params: {
            hostname: selectedDevice.hostname,
            ip: selectedDevice.ip,
            ...(selectedDevice.tags?.length ? { tags: selectedDevice.tags.join(',') } : {}),
          },
        },
      )
      .then((res) => {
        if (selectedDeviceId === deviceId) setDeviceMetrics(res.data)
        setMetricsLoading(false)
      })
      .catch(() => {
        if (selectedDeviceId === deviceId) {
          setDeviceMetrics(null)
          setMetricsError(true)
        }
        setMetricsLoading(false)
      })
  }, [selectedDevice, selectedDeviceId])

  async function handleChatSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatLoading(true)
    setChatReply(null)
    try {
      const res = await axios.post<{ reply: string }>(
        `${AI_BASE}/api/chat`,
        { message: chatInput },
        { withCredentials: false },
      )
      setChatReply(res.data.reply)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Chat error', err)
      setChatReply('Error talking to AI backend.')
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4.5rem)] gap-4">
      <aside className="hidden w-64 flex-none flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 md:flex">
        <h2 className="text-sm font-semibold text-slate-200">Devices</h2>
        <div className="flex-1 space-y-1 overflow-y-auto pr-1 text-sm">
          {devices.map((d) => {
            const latest = latestAlertByDevice.get(d.id)
            const sev = latest?.severity ?? 'info'
            const dotColor =
              sev === 'critical'
                ? 'bg-red-500'
                : sev === 'warning'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setSelectedDeviceId(d.id)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition ${
                  selectedDeviceId === d.id
                    ? 'bg-slate-800/80'
                    : 'hover:bg-slate-800/60'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                    <span className="truncate text-xs font-medium text-slate-100">
                      {d.hostname}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    {d.ip}
                  </div>
                </div>
              </button>
            )
          })}
          {devices.length === 0 && (
            <div className="text-xs text-slate-500">
              No devices yet. Run the edge <code>install.sh</code> script.
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)]">
          <div className="min-h-[260px] rounded-xl border border-slate-800 bg-slate-900/70 p-3 md:p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">
                3D Digital Twin
              </h2>
              <p className="text-xs text-slate-500">
                Left-click node to select · Right-drag to rotate · Scroll to zoom
              </p>
            </div>
            <div className="h-[260px] w-full md:h-[320px]">
              <Suspense
                fallback={
                  <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-900/80 text-sm text-slate-400">
                    Loading 3D view…
                  </div>
                }
              >
                <DigitalTwinScene
                  devices={devices}
                  latestAlerts={latestAlertByDevice}
                  selectedDeviceId={selectedDeviceId}
                  onSelectDevice={setSelectedDeviceId}
                />
              </Suspense>
            </div>
          </div>

          <div className="flex min-h-[260px] flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 md:p-4">
            <h2 className="text-sm font-semibold text-slate-200">Alerts</h2>
            <div className="flex-1 space-y-1 overflow-y-auto pr-1 text-xs">
              {alerts.slice(0, 20).map((a) => {
                const sevColor =
                  a.severity === 'critical'
                    ? 'text-red-400'
                    : a.severity === 'warning'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                return (
                  <div
                    key={a.id}
                    className="rounded-md border border-slate-800/80 bg-slate-900/80 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-medium ${sevColor}`}>
                        {a.severity.toUpperCase()}
                        {a.isPredictive ? ' · predictive' : ''}
                      </span>
                      <span className="truncate text-[10px] text-slate-500">
                        {a.device?.hostname ?? 'unknown'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-200">
                      {a.message}
                    </div>
                  </div>
                )
              })}
              {alerts.length === 0 && (
                <div className="text-xs text-slate-500">
                  No alerts yet. Once the AI worker detects anomalies, they will
                  appear here.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 md:p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">
              Device details
            </h2>
            {selectedDevice ? (
              <div className="space-y-2 text-xs text-slate-200">
                <div className="font-medium">{selectedDevice.hostname}</div>
                <div className="text-slate-400">{selectedDevice.ip}</div>
                <div className="text-slate-400">
                  Status: <span className="font-medium">{selectedDevice.status}</span>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2">
                  <div className="text-[11px] text-slate-400 mb-1">Live metrics (Prometheus)</div>
                  {metricsLoading ? (
                    <p className="text-[11px] text-slate-500">Loading…</p>
                  ) : metricsError ? (
                    <p className="text-[11px] text-amber-400">Start the Python API on port 8000 to see CPU / Memory / Disk.</p>
                  ) : (
                    <div className="flex flex-wrap gap-4 text-[11px]">
                      <span className="text-slate-400">CPU: <span className="font-medium text-slate-100">{deviceMetrics?.cpu_pct != null ? `${deviceMetrics.cpu_pct}%` : '—'}</span></span>
                      <span className="text-slate-400">Memory: <span className="font-medium text-slate-100">{deviceMetrics?.memory_pct != null ? `${deviceMetrics.memory_pct}%` : '—'}</span></span>
                      <span className="text-slate-400">Disk: <span className="font-medium text-slate-100">{deviceMetrics?.disk_pct != null ? `${deviceMetrics.disk_pct}%` : '—'}</span></span>
                    </div>
                  )}
                  {!metricsLoading && !metricsError && deviceMetrics && deviceMetrics.cpu_pct == null && deviceMetrics.memory_pct == null && deviceMetrics.disk_pct == null && (
                    <p className="text-[11px] text-slate-500 mt-1">No data yet. Check <a href="http://localhost:9090/targets" target="_blank" rel="noreferrer" className="text-violet-400 underline">Prometheus targets</a>.</p>
                  )}
                </div>
                {selectedDevice.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedDevice.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-[11px] text-slate-400">
                  Recent AI findings:
                </div>
                <div className="space-y-1">
                  {selectedDeviceAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-md border border-slate-800 bg-slate-950/70 px-2 py-1 text-[11px]"
                    >
                      <span className="mr-1 text-slate-400">
                        {a.severity.toUpperCase()}:
                      </span>
                      {a.message}
                    </div>
                  ))}
                  {selectedDeviceAlerts.length === 0 && (
                    <div className="text-[11px] text-slate-500">
                      No AI alerts yet for this device.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Select a node in the 3D view or from the device list to inspect
                its details.
              </div>
            )}
          </div>

          <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/70 p-3 md:p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-200">
              AI assistant
            </h2>
            <form onSubmit={handleChatSubmit} className="mb-2 flex gap-2">
              <input
                className="flex-1 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none ring-0 focus:border-violet-500"
                placeholder="Ask about your infrastructure (e.g. “Which nodes are at risk in the next 4h?”)"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={chatLoading}
                className="rounded-md bg-violet-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {chatLoading ? 'Asking…' : 'Ask'}
              </button>
            </form>
            <div className="min-h-[80px] flex-1 rounded-md border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
              {chatReply ? (
                <p className="whitespace-pre-wrap">{chatReply}</p>
              ) : (
                <p className="text-slate-500">
                  The answer to your question will appear here.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

