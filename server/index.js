import express from 'express'
import cors from 'cors'
import dns from 'dns/promises'
import net from 'net'
import { performance } from 'perf_hooks'

const PORT = process.env.PORT || 8811
const app = express()
app.use(cors())
app.use(express.json())

/** Allowlist — lab only probes these hosts (defensive diagnostics, not a scanner). */
const ALLOW = new Set([
  'cloudflare.com',
  '1.1.1.1',
  'dns.google',
  '8.8.8.8',
  'github.com',
  'example.com',
  'localhost',
])

function allowedHost(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '')
  if (!h) return false
  if (ALLOW.has(h)) return true
  return [...ALLOW].some((a) => h.endsWith('.' + a))
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'netprobe-lab' }))

app.get('/api/dns', async (req, res) => {
  const host = String(req.query.host || '')
  if (!allowedHost(host)) {
    return res.status(400).json({ error: 'Host not on lab allowlist', allow: [...ALLOW] })
  }
  try {
    const t0 = performance.now()
    const [a, aaaa] = await Promise.all([
      dns.resolve4(host).catch(() => []),
      dns.resolve6(host).catch(() => []),
    ])
    res.json({ host, a, aaaa, ms: Math.round(performance.now() - t0) })
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

app.get('/api/tcp-check', async (req, res) => {
  const host = String(req.query.host || '')
  const port = Number(req.query.port || 443)
  if (!allowedHost(host)) {
    return res.status(400).json({ error: 'Host not on lab allowlist', allow: [...ALLOW] })
  }
  if (![80, 443, 53, 22].includes(port)) {
    return res.status(400).json({ error: 'Lab ports only: 22, 53, 80, 443' })
  }
  const t0 = performance.now()
  const socket = new net.Socket()
  const done = (ok, err) => {
    try {
      socket.destroy()
    } catch {}
    res.json({ host, port, open: ok, ms: Math.round(performance.now() - t0), error: err || null })
  }
  socket.setTimeout(2500)
  socket.once('connect', () => done(true))
  socket.once('timeout', () => done(false, 'timeout'))
  socket.once('error', (e) => done(false, e.message))
  socket.connect(port, host)
})

app.get('/api/cidr', (req, res) => {
  const cidr = String(req.query.cidr || '')
  const m = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!m) return res.status(400).json({ error: 'Expected a.b.c.d/prefix' })
  const octets = m.slice(1, 5).map(Number)
  const prefix = Number(m[5])
  if (octets.some((o) => o > 255) || prefix > 32) return res.status(400).json({ error: 'Invalid CIDR' })
  const ip =
    ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + (octets[3] >>> 0)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const fmt = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
  const hosts = prefix >= 31 ? Math.max(0, 2 ** (32 - prefix)) : 2 ** (32 - prefix) - 2
  res.json({
    cidr,
    network: fmt(network),
    broadcast: fmt(broadcast),
    netmask: fmt(mask),
    wildcard: fmt(~mask >>> 0),
    hostCount: hosts,
    firstHost: prefix >= 31 ? fmt(network) : fmt(network + 1),
    lastHost: prefix >= 31 ? fmt(broadcast) : fmt(broadcast - 1),
  })
})

app.listen(PORT, () => console.log(`netprobe-lab on :${PORT}`))
