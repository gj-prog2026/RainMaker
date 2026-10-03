// Server-only adapter for the RAINMAKER backend (decisioning, experiment tracking, persistent memory).
// Maps backend responses into the frontend's existing types. Never import from client code.
import {
  buildState,
  type Conditions,
  type Learning,
  type Results,
  type Strategy,
  type VariantId,
  type VariantResult,
} from "./agent";

const BASE = (process.env["RAINMAKER_BACKEND_URL"]?.trim() || "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export class BackendError extends Error {
  constructor(public status: number) {
    super(`backend ${status}`);
  }
}

export async function backend<T>(path: string, body?: unknown, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? null : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new BackendError(res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ---- backend shapes (subset) ----
interface BCampaign {
  variant: VariantId;
  offer_code: string;
  name: string;
  offer: string;
  price: string;
  target_segment: string;
  channel: string;
  strategy: string;
  copy: string;
  voice_script: string;
  reasoning: string;
}
interface BExperiment {
  variant: VariantId;
  name: string;
  impressions: number;
  claims: number;
  conversion_rate: number;
  estimated_revenue: number;
  estimated_margin: number;
}
export interface BRunAgent {
  objective: string;
  summary: string;
  reasoning?: string[];
  avoid_promoting?: { product: string; reason: string }[];
  campaigns: BCampaign[];
  next_action?: string;
  decision_source?: string;
  model?: string;
  relevant_memories?: string[];
  memory_provider?: string;
  fallback_mode?: boolean;
}
export interface BResults {
  experiment: BExperiment[];
  campaigns: BCampaign[];
}
export interface BLearn {
  learning: string;
  campaign_observation: BExperiment[];
  memory_provider: string;
}
interface BState {
  memories?: { source?: string }[];
}

export function toBackendInput(c: Conditions) {
  const inv = buildState(c).inventory;
  const hours = (id: string) => inv.find((i) => i.id === id)?.hoursRemaining ?? undefined;
  return {
    temperature_c: c.tempC,
    rain_probability: c.rainProb,
    chicken_quantity: c.chickenStock,
    chicken_hours_to_expiry: hours("chicken"),
    buns_quantity: inv.find((i) => i.id === "buns")?.qty,
    buns_hours_to_expiry: hours("buns"),
    stock_urgency: c.urgency === "Critical" ? "high" : c.urgency.toLowerCase(),
    expected_demand: c.demand.toLowerCase(),
  };
}

export function mapStrategy(r: BRunAgent): Strategy {
  const avoid = r.avoid_promoting?.[0];
  const openModel = r.decision_source !== "deterministic_fallback" && !r.fallback_mode;
  return {
    objective: r.objective,
    insight: r.summary,
    avoid: avoid ? { item: avoid.product, reason: avoid.reason } : null,
    variants: (["A", "B"] as const).map((id) => {
      const c = r.campaigns.find((x) => x.variant === id)!;
      return {
        id,
        name: c.name,
        items: c.offer,
        price: c.price,
        target: c.target_segment,
        channel: c.channel,
        strategy: c.strategy,
        copy: c.copy,
        voiceScript: c.voice_script,
        reasoning: c.reasoning,
      };
    }),
    source: "rainmaker",
    model: openModel ? (r.model ?? null) : null,
    decisionSource: openModel ? "open_model" : "deterministic_fallback",
    reasoning: r.reasoning ?? [],
    nextAction: r.next_action,
    relevantMemories: r.relevant_memories ?? [],
    memoryProvider: r.memory_provider,
  };
}

const empty = (): VariantResult => ({
  impressions: 0,
  claims: 0,
  conversion: 0,
  revenue: 0,
  margin: 0,
});

export function mapResults(exp: BExperiment[]): Results {
  const out: Results = { A: empty(), B: empty() };
  for (const e of exp) {
    out[e.variant] = {
      impressions: e.impressions,
      claims: e.claims,
      conversion: Math.round(e.conversion_rate),
      revenue: e.estimated_revenue,
      margin: e.estimated_margin,
    };
  }
  return out;
}

/** Saves the observation to backend memory and maps it to the frontend's Learning shape. */
export async function backendLearn(): Promise<Learning> {
  const l = await backend<BLearn>("/api/learn", {});
  const [results, state] = await Promise.all([
    backend<BResults>("/api/results"),
    backend<BState>("/api/state").catch(() => ({}) as BState),
  ]);
  const r = mapResults(l.campaign_observation);
  // Winner from observed data: conversion first, contribution margin as tie-break.
  const winner: VariantId =
    r.B.conversion > r.A.conversion
      ? "B"
      : r.A.conversion > r.B.conversion
        ? "A"
        : r.B.margin >= r.A.margin
          ? "B"
          : "A";
  const w = results.campaigns.find((c) => c.variant === winner);
  const impressions = r.A.impressions + r.B.impressions;
  const memories = state.memories ?? [];
  return {
    memory: l.learning,
    nextDecision: `Allocate more traffic to Variant ${winner}${w ? ` (${w.strategy.toLowerCase()})` : ""} under similar conditions, and keep testing.`,
    confidence: impressions < 20 ? "Early signal" : "Building",
    campaignsObserved: memories.filter((m) => m.source === "campaign observation").length,
    relevantLearnings: memories.length,
    winner,
    source: "rainmaker",
    model: null,
    memoryProvider: l.memory_provider,
  };
}
