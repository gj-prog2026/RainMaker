# RAINMAKER

**An autonomous demand agent for independent restaurants. It turns tonight's stock, weather and demand into tested campaigns, and it remembers what worked.**

## Live Demo

**▶ [https://jam-greetings-seasonal-this.trycloudflare.com](https://jam-greetings-seasonal-this.trycloudflare.com)**

> **Note:** This public demo is temporary. It stays live only while the local Cloudflare tunnel and both local servers (frontend and backend) are running.
> The first load can take a few seconds before **Run Rainmaker** responds to clicks.

---

## The Problem

Large restaurant chains have operations teams, pricing infrastructure, experimentation systems and feedback loops. An independent restaurant usually has none of these. When rain empties the street and chicken is 18 hours from expiry, the owner guesses. If they try a promotion, nothing measures it, and the lesson is gone by next week.

## What RAINMAKER Does

RAINMAKER is a demand agent built for **Bradford Fried Chicken**, a demo restaurant in Bradford, Yorkshire. It:

- **Observes** weather, expected demand, stock levels and expiry pressure
- **Decides** whether an intervention is needed, which products to push and which to **avoid promoting** (for example, cold drinks on a cold night)
- **Generates two competing A/B campaigns**, each with an offer, price, target segment, channel, strategy, copy and voice script
- **Measures** real customer scans and claims, and calculates conversion, estimated revenue and contribution margin
- **Saves** the outcome as a new memory
- **Recalls** relevant previous experiments the next time it decides

---

## Closed Learning Loop

<p align="center"><strong>Observe → Remember → Decide → Act → Measure → Learn</strong></p>

> ### Every campaign becomes operational memory for the next decision.

RAINMAKER does not treat each run as a one-off generation task. **Before** it decides, it retrieves relevant past experiments from memory. **After** a campaign runs, it writes the observed outcome back to memory. On the next run, the dashboard shows which memories were recalled. The newest campaign observation appears at the top, so you can watch the agent build on its own results.

---

## OpenLoft / Memory Architecture

RAINMAKER is designed around **persistent external agent memory**:

- **Retrieve before deciding.** Each run builds a query from current conditions (weather, temperature, rain probability, at-risk stock and recent campaigns) and pulls relevant past context and outcomes into the decision.
- **Write after measuring.** "Learn from results" turns the live experiment into a campaign observation: conversion for each variant, the margin per order and conditions such as weather and temperature. That observation is stored as a new memory.
- **OpenLoft-compatible integration path.** The backend memory module supports an OpenLoft-compatible service through a search endpoint and a write endpoint. Both paths are configurable (`OPENLOFT_API_URL`, `OPENLOFT_API_KEY`, `OPENLOFT_SEARCH_PATH`, `OPENLOFT_WRITE_PATH`). Every write also keeps a local copy, and failed external calls fall back to local memory.
- **Working fallback.** The submitted demo uses **persistent local JSON memory**. It survives restarts and resets ("reset demo" clears campaigns and counters but keeps learned memories).

> The demo uses a persistent local memory adapter, while the same search/write interface supports OpenLoft as an external memory layer.

OpenLoft is **not** live-configured in the submitted demo. The UI always shows which memory provider handled the run, for example "persistent local JSON memory". The backend also includes an optional NMAFC memory adapter using the same pattern.

---

## Demo Flow

1. **Change restaurant conditions:** rain probability, temperature, chicken stock, stock urgency and expected demand.
2. **Run RAINMAKER:** watch it observe, analyse risk, retrieve memory, create a strategy and design the experiment.
3. **Inspect the strategy and A/B campaigns:** the objective, key insight, reasoning, what to avoid promoting, the recalled memories and two campaign variants.
4. **Launch the variants.**
5. **A customer views and claims the offer:** scan the variant QR code or open `/offer?variant=A` or `/offer?variant=B`.
6. **Metrics update live:** impressions, claims, conversion, estimated revenue and contribution margin refresh every 2 seconds.
7. **Learn from results:** RAINMAKER picks the winner from the observed data and writes the observation to memory.
8. **Run again:** the observation you just saved now appears under "Recalled from agent memory".

---

## Architecture

```
Frontend  (TanStack Start + React, Ginger's UX)
   ↓
Server-side API proxy / adapter  (/api/* routes → src/lib/backend.server.ts)
   ↓
RAINMAKER backend  (Node.js, port 3000)
   ↓
Decision engine + experiment tracking + persistent memory
```

- Ginger's frontend UX is kept intact: the conditions panel, run sequence, campaign cards, post kit, offer pages and live experiment view. The backend now powers the decision, experiment and learning loop behind it.
- The frontend's own `/api/*` routes call the backend **server-side**. There are no CORS issues, credentials stay off the client, and the adapter maps backend responses into the frontend's existing data types.
- If the backend is unreachable, each route falls back to the frontend's local deterministic logic, and the UI shows a "Live service unavailable" banner.

---

## Key Features

- **End-to-end restaurant intervention flow:** conditions → decision → campaigns → measurement → memory
- **A/B campaigns:** two deliberately different strategies, such as a price-led bundle against a value-add offer
- **Live scans and claims** recorded by the backend experiment tracker
- **Revenue and margin tracking** from a fixed offer catalogue with price and food-cost data
- **Persistent learning:** each experiment becomes a stored campaign observation
- **Recalled memories on later runs,** shown in the strategy panel with the memory provider
- **Customer offer pages** that show the live backend campaign, with a QR code for each variant
- **Campaign post kit:** a poster, captions and a story video, editable through a chat-style instruction box
- **Graceful fallback:** if the model or backend is unavailable, the flow keeps working and the UI says so

---

## Open Model Architecture

The backend has a **Gemma decision path**, reached through an OpenAI-compatible endpoint (local Ollama by default). The model gets the restaurant state, stock-risk metrics, synthetic sales context and recalled memories. It must return a structured decision, which the backend validates. Prices and margins always come from the deterministic offer catalogue and are never invented by the model.

Every response shows where the decision came from. The strategy panel says either **"Decided by Gemma · RAINMAKER agent"** or **"RAINMAKER agent · rules fallback"**.

**The submitted demo uses the rules fallback** because Gemma is not live-configured. The experiment tracking, metrics and persistent memory loop are fully live either way.

---

## Running Locally

Requirements: Node.js 20+ and [Bun](https://bun.sh).

The RAINMAKER backend is a separate Node.js project (`rainmaker`). This repository contains the frontend and the server-side adapter.

**1. Backend (port 3000)**

```bash
cd rainmaker
npm install
npm start
```

Optional: `npm run seed` resets the backend to its seeded state, including memories. `npm run reset-demo` clears campaigns and counters but keeps memories.

**2. Frontend (port 8080)**

```bash
bun install
bun run dev
```

Open [http://localhost:8080](http://localhost:8080). The frontend expects the backend at `http://localhost:3000`. Set `RAINMAKER_BACKEND_URL` to point it somewhere else.

**3. Optional public tunnel**

```bash
cloudflared tunnel --url http://localhost:8080 --http-host-header localhost:8080
```

---

## Current Demo Limitations

- The Gemma decision path currently runs on the **rules fallback**, because the model is not live-configured.
- **OpenLoft and NMAFC** memory adapters are implemented but **not live-configured**.
- Some restaurant data is **synthetic**, including the sales history, inventory and weather inputs.
- The submitted demo uses **persistent local JSON memory**.

---

## Built With

TanStack Start · React · TypeScript · Tailwind CSS · Node.js · Lovable
