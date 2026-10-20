<script setup>
import { computed, ref } from 'vue'

const ALLOW = ['cloudflare.com', '1.1.1.1', 'dns.google', '8.8.8.8', 'github.com', 'example.com', 'localhost']
const tab = ref('dns')
const host = ref('cloudflare.com')
const port = ref(443)
const cidr = ref('192.168.10.0/24')
const dnsResult = ref(null)
const tcpResult = ref(null)
const cidrResult = ref(null)
const latency = ref([])
const busy = ref(false)
const err = ref('')
const mode = ref('auto') // auto tries API then falls back to local

function parseCidr(input) {
  const m = String(input).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!m) throw new Error('Expected a.b.c.d/prefix')
  const octets = m.slice(1, 5).map(Number)
  const prefix = Number(m[5])
  if (octets.some((o) => o > 255) || prefix > 32) throw new Error('Invalid CIDR')
  const ip = ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + (octets[3] >>> 0)
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const fmt = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
  const hosts = prefix >= 31 ? Math.max(0, 2 ** (32 - prefix)) : 2 ** (32 - prefix) - 2
  return {
    cidr: input,
    network: fmt(network),
    broadcast: fmt(broadcast),
    netmask: fmt(mask),
    wildcard: fmt(~mask >>> 0),
    hostCount: hosts,
    firstHost: prefix >= 31 ? fmt(network) : fmt(network + 1),
    lastHost: prefix >= 31 ? fmt(broadcast) : fmt(broadcast - 1),
  }
}

const DEMO_DNS = {
  'cloudflare.com': { a: ['104.16.132.229', '104.16.133.229'], aaaa: ['2606:4700::6810:84e5'] },
  'dns.google': { a: ['8.8.8.8', '8.8.4.4'], aaaa: ['2001:4860:4860::8888'] },
  'github.com': { a: ['140.82.121.4'], aaaa: [] },
  'example.com': { a: ['93.184.216.34'], aaaa: ['2606:2800:220:1:248:1893:25c8:1946'] },
  '1.1.1.1': { a: ['1.1.1.1'], aaaa: [] },
  '8.8.8.8': { a: ['8.8.8.8'], aaaa: [] },
  localhost: { a: ['127.0.0.1'], aaaa: ['::1'] },
}

async function api(path) {
  const res = await fetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

async function runDns() {
  busy.value = true
  err.value = ''
  try {
    if (!ALLOW.includes(host.value) && !ALLOW.some((a) => host.value.endsWith('.' + a))) {
      throw new Error('Host not on lab allowlist')
    }
    try {
      dnsResult.value = await api(`/api/dns?host=${encodeURIComponent(host.value)}`)
      mode.value = 'live'
    } catch {
      const demo = DEMO_DNS[host.value] || { a: ['203.0.113.10'], aaaa: [] }
      dnsResult.value = { host: host.value, ...demo, ms: 12 + Math.floor(Math.random() * 30), demo: true }
      mode.value = 'demo'
    }
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

async function runTcp() {
  busy.value = true
  err.value = ''
  try {
    try {
      tcpResult.value = await api(
        `/api/tcp-check?host=${encodeURIComponent(host.value)}&port=${port.value}`,
      )
      mode.value = 'live'
    } catch {
      tcpResult.value = {
        host: host.value,
        port: port.value,
        open: [80, 443].includes(Number(port.value)),
        ms: 18 + Math.floor(Math.random() * 40),
        demo: true,
      }
      mode.value = 'demo'
    }
  } catch (e) {
    err.value = e.message
  } finally {
    busy.value = false
  }
}

async function runCidr() {
  err.value = ''
  try {
    try {
      cidrResult.value = await api(`/api/cidr?cidr=${encodeURIComponent(cidr.value)}`)
      mode.value = 'live'
    } catch {
      cidrResult.value = parseCidr(cidr.value)
      mode.value = 'demo'
    }
  } catch (e) {
    err.value = e.message
  }
}

async function runLatency() {
  busy.value = true
  err.value = ''
  const targets = [
    'https://cloudflare.com/cdn-cgi/trace',
    'https://www.github.com/favicon.ico',
    'https://example.com/',
  ]
  const rows = []
  for (const url of targets) {
    const t0 = performance.now()
    try {
      await fetch(url, { mode: 'no-cors', cache: 'no-store' })
      rows.push({ url, ms: Math.round(performance.now() - t0), ok: true })
    } catch {
      rows.push({ url, ms: Math.round(performance.now() - t0), ok: false })
    }
  }
  latency.value = rows
  busy.value = false
}

const allowLabel = computed(() => ALLOW.join(' · '))
</script>

<template>
  <div class="shell">
    <header>
      <div class="brand">
        <div class="mark" />
        <div>
          <h1>Netprobe Lab</h1>
          <p>Allowlisted network diagnostics — DNS · TCP · CIDR · latency</p>
        </div>
      </div>
      <span class="badge" :data-mode="mode">{{ mode === 'live' ? 'API live' : 'Offline demo' }}</span>
    </header>

    <p class="allow">Allowlist: <code>{{ allowLabel }}</code></p>

    <nav class="tabs">
      <button type="button" :class="{ on: tab === 'dns' }" @click="tab = 'dns'">DNS</button>
      <button type="button" :class="{ on: tab === 'tcp' }" @click="tab = 'tcp'">TCP check</button>
      <button type="button" :class="{ on: tab === 'cidr' }" @click="tab = 'cidr'">CIDR</button>
      <button type="button" :class="{ on: tab === 'lat' }" @click="tab = 'lat'">Latency</button>
    </nav>

    <p v-if="err" class="err">{{ err }}</p>

    <section v-if="tab === 'dns'" class="panel">
      <label>
        Host
        <input v-model="host" list="hosts" />
      </label>
      <datalist id="hosts">
        <option v-for="h in ALLOW" :key="h" :value="h" />
      </datalist>
      <button class="primary" type="button" :disabled="busy" @click="runDns">Resolve</button>
      <pre v-if="dnsResult">{{ JSON.stringify(dnsResult, null, 2) }}</pre>
    </section>

    <section v-else-if="tab === 'tcp'" class="panel">
      <div class="row2">
        <label>
          Host
          <input v-model="host" list="hosts" />
        </label>
        <label>
          Port
          <select v-model.number="port">
            <option :value="22">22</option>
            <option :value="53">53</option>
            <option :value="80">80</option>
            <option :value="443">443</option>
          </select>
        </label>
      </div>
      <button class="primary" type="button" :disabled="busy" @click="runTcp">Probe TCP</button>
      <pre v-if="tcpResult">{{ JSON.stringify(tcpResult, null, 2) }}</pre>
    </section>

    <section v-else-if="tab === 'cidr'" class="panel">
      <label>
        CIDR
        <input v-model="cidr" placeholder="10.0.0.0/24" />
      </label>
      <button class="primary" type="button" @click="runCidr">Calculate</button>
      <div v-if="cidrResult" class="cidr-grid">
        <div v-for="(v, k) in cidrResult" :key="k"><span>{{ k }}</span><b>{{ v }}</b></div>
      </div>
    </section>

    <section v-else class="panel">
      <p class="hint">Browser fetch timing to public endpoints (no-cors). Useful as a rough RTT signal.</p>
      <button class="primary" type="button" :disabled="busy" @click="runLatency">Run probes</button>
      <div v-if="latency.length" class="lat">
        <div v-for="r in latency" :key="r.url" class="lat-row">
          <code>{{ r.url }}</code>
          <b :data-ok="r.ok">{{ r.ms }} ms</b>
        </div>
      </div>
    </section>

    <footer>
      Defensive lab tool — only allowlisted hosts; not a general-purpose scanner.
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  padding: 20px clamp(14px, 3vw, 32px) 32px;
  max-width: 880px;
  margin: 0 auto;
  display: grid;
  gap: 14px;
}
header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  animation: rise .4s ease;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.brand { display: flex; gap: 12px; align-items: center; }
.mark {
  width: 44px; height: 44px; border-radius: 12px;
  background:
    linear-gradient(135deg, rgba(61,255,168,.25), transparent 55%),
    #0e2030;
  border: 1px solid var(--line);
  position: relative;
}
.mark::before {
  content: '';
  position: absolute; inset: 14px 10px;
  border: 2px solid var(--cyan);
  border-radius: 4px;
  clip-path: polygon(0 40%, 40% 0, 100% 0, 100% 60%, 60% 100%, 0 100%);
}
h1 { margin: 0; font-size: 1.35rem; letter-spacing: -0.02em; }
.brand p { margin: 4px 0 0; color: var(--muted); font-size: .88rem; }
.badge {
  font-family: var(--mono); font-size: .72rem; padding: 7px 10px; border-radius: 999px;
  border: 1px solid var(--line); color: var(--muted);
}
.badge[data-mode='live'] { color: var(--mint); border-color: rgba(61,255,168,.35); }
.allow { margin: 0; color: var(--faint); font-size: .8rem; }
.allow code { color: var(--cyan); font-family: var(--mono); font-size: .72rem; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tabs button {
  padding: 8px 12px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted);
}
.tabs button.on { color: var(--text); border-color: rgba(78,196,255,.45); background: rgba(78,196,255,.08); }
.panel {
  padding: 16px; border-radius: 16px; border: 1px solid var(--line); background: var(--panel);
  display: grid; gap: 12px; animation: rise .35s ease;
}
label { display: grid; gap: 6px; font-size: .8rem; color: var(--muted); }
input, select {
  padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: #07131c; outline: none;
}
input:focus, select:focus { border-color: rgba(78,196,255,.5); }
.row2 { display: grid; grid-template-columns: 1fr 120px; gap: 10px; }
.primary {
  justify-self: start; padding: 10px 16px; border-radius: 999px; font-weight: 700;
  background: linear-gradient(180deg, #63e0ff, #1a8fc4); color: #041018;
}
pre {
  margin: 0; padding: 12px; border-radius: 12px; background: #07131c; border: 1px solid var(--line);
  font-family: var(--mono); font-size: .78rem; overflow: auto; color: #b7d7ea;
}
.cidr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cidr-grid div {
  padding: 10px; border-radius: 10px; background: #07131c; border: 1px solid var(--line);
  display: grid; gap: 4px;
}
.cidr-grid span { color: var(--faint); font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; }
.cidr-grid b { font-family: var(--mono); font-size: .85rem; font-weight: 500; }
.hint { margin: 0; color: var(--muted); font-size: .9rem; }
.lat { display: grid; gap: 8px; }
.lat-row {
  display: flex; justify-content: space-between; gap: 10px; align-items: center;
  padding: 10px 12px; border-radius: 10px; background: #07131c; border: 1px solid var(--line);
}
.lat-row code { font-size: .72rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
.lat-row b { font-family: var(--mono); color: var(--mint); }
.lat-row b[data-ok='false'] { color: #ff7b8a; }
.err { color: #ff7b8a; margin: 0; }
footer { color: var(--faint); font-size: .78rem; }
@media (max-width: 640px) {
  .row2, .cidr-grid { grid-template-columns: 1fr; }
}
</style>
