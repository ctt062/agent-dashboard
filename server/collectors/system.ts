import { execFileSync } from 'node:child_process'
import { cpus, freemem, hostname, loadavg, totalmem, uptime } from 'node:os'
import type { SystemSnapshot } from '../types.js'

function parseTopCpu(): number {
  try {
    const out = execFileSync('top', ['-l', '1', '-n', '0'], {
      encoding: 'utf8',
      timeout: 8000,
    })
    const line = out.split('\n').find((l) => l.includes('CPU usage'))
    if (!line) return 0
    // CPU usage: 3.76% user, 8.77% sys, 87.46% idle
    const idle = Number(line.match(/([\d.]+)%\s*idle/i)?.[1] ?? NaN)
    if (Number.isFinite(idle)) return Math.max(0, Math.min(100, 100 - idle))
    const user = Number(line.match(/([\d.]+)%\s*user/i)?.[1] ?? 0)
    const sys = Number(line.match(/([\d.]+)%\s*sys/i)?.[1] ?? 0)
    return Math.max(0, Math.min(100, user + sys))
  } catch {
    return 0
  }
}

function parseGpu(): { utilization: number; name: string; cores: number | null } {
  let utilization = 0
  let name = 'GPU'
  let cores: number | null = null
  try {
    const ioreg = execFileSync(
      'ioreg',
      ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'],
      { encoding: 'utf8', timeout: 5000 },
    )
    const m = ioreg.match(/"Device Utilization %"=(\d+)/)
    if (m) utilization = Number(m[1])
    const tiler = ioreg.match(/"Tiler Utilization %"=(\d+)/)
    const renderer = ioreg.match(/"Renderer Utilization %"=(\d+)/)
    if (!m && (tiler || renderer)) {
      utilization = Math.max(
        Number(tiler?.[1] ?? 0),
        Number(renderer?.[1] ?? 0),
      )
    }
  } catch {
    /* ignore */
  }
  try {
    const sp = execFileSync('system_profiler', ['SPDisplaysDataType'], {
      encoding: 'utf8',
      timeout: 8000,
    })
    name =
      sp.match(/Chipset Model:\s*(.+)/)?.[1]?.trim() ??
      sp.match(/^\s{4}(.+):\s*$/m)?.[1]?.trim() ??
      name
    const c = sp.match(/Total Number of Cores:\s*(\d+)/)?.[1]
    if (c) cores = Number(c)
  } catch {
    /* ignore */
  }
  return { utilization, name, cores }
}

export function collectSystem(): SystemSnapshot {
  const total = totalmem()
  const free = freemem()
  const used = total - free
  const cpuModel = cpus()[0]?.model ?? 'CPU'
  const cpuCount = cpus().length

  return {
    hostname: hostname(),
    uptimeSec: Math.floor(uptime()),
    loadAvg: loadavg(),
    cpu: {
      model: cpuModel,
      cores: cpuCount,
      utilization: Math.round(parseTopCpu() * 10) / 10,
    },
    memory: {
      totalBytes: total,
      usedBytes: used,
      freeBytes: free,
      utilization: Math.round((used / total) * 1000) / 10,
    },
    gpu: parseGpu(),
    sampledAt: new Date().toISOString(),
  }
}
