# Netprobe Lab

**Allowlisted network diagnostics** — DNS resolve, TCP checks (22/53/80/443), CIDR math, browser latency probes.

Live demo: **https://kianpk.github.io/netprobe-lab/**

## Why allowlisted?

This is a **lab / admin diagnostics** tool, not a general scanner. The API only probes an explicit host allowlist (Cloudflare, Google DNS, GitHub, example.com, localhost).

## Stack

Vue 3 · Vite · Node (`dns`, `net`) · Express

## Run

```bash
cd server && npm i && node index.js
cd client && npm i && npm run dev
cd client && npm run build   # → docs/
```
