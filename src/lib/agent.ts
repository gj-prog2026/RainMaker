// Deterministic "agent" logic. Pure functions so a real AI backend can replace them.

export type Urgency = "Low" | "Medium" | "Critical";
export type DemandLevel = "Quiet" | "Normal" | "Busy";
export type VariantId = "A" | "B";
export type Risk = "HIGH RISK" | "MEDIUM RISK" | "LOW RISK" | "LOW URGENCY";
export type CampaignStatus = "Not running" | "Running" | "Learning";

export interface Conditions {
  rainProb: number;
  tempC: number;
  chickenStock: number;
  urgency: Urgency;
  demand: DemandLevel;
}

export const DEFAULT_CONDITIONS: Conditions = {
  rainProb: 82,
  tempC: 8,
  chickenStock: 70,
  urgency: "Medium",
  demand: "Normal",
};

/** Editable economics assumptions. */
export const ECONOMICS = {
  A: { revenuePerClaim: 18.95, marginRate: 0.42 },
  B: { revenuePerClaim: 16, marginRate: 0.55 },
};

export const SEED_RAW: Record<VariantId, { impressions: number; claims: number }> = {
  A: { impressions: 12, claims: 4 },
  B: { impressions: 11, claims: 6 },
};

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  hoursRemaining: number | null;
  stockNote?: string;
  risk: Risk;
}

export interface AppState {
  weather: { tempC: number; condition: string; rainProb: number };
  demand: { delivery: string; walkIn: string };
  stockAtRisk: number;
  inventory: InventoryItem[];
  campaignStatus: CampaignStatus;
}

export interface Variant {
  id: VariantId;
  name: string;
  items: string;
  price: string;
  target: string;
  channel: string;
  strategy: string;
  copy: string;
  /** Backend-only extras (optional). */
  voiceScript?: string | undefined;
  reasoning?: string | undefined;
}

export interface Strategy {
  objective: string;
  insight: string;
  avoid: { item: string; reason: string } | null;
  variants: Variant[];
  source?: "gemma" | "fallback" | "rainmaker";
  model?: string | null;
  /** Set when the RAINMAKER backend made the decision. */
  decisionSource?: "open_model" | "deterministic_fallback";
  reasoning?: string[];
  nextAction?: string | undefined;
  relevantMemories?: string[];
  memoryProvider?: string | undefined;
}

export interface VariantResult {
  impressions: number;
  claims: number;
  conversion: number;
  revenue: number;
  margin: number;
}
export type Results = Record<VariantId, VariantResult>;

export interface Learning {
  memory: string;
  nextDecision: string;
  confidence: string;
  campaignsObserved: number;
  relevantLearnings: number;
  winner: VariantId;
  source?: "gemma" | "fallback" | "rainmaker";
  model?: string | null;
  memoryProvider?: string | undefined;
}

const urgencyFactor: Record<Urgency, number> = { Low: 0.6, Medium: 1, Critical: 1.3 };

function weatherCondition(rain: number) {
  if (rain >= 75) return "Heavy rain";
  if (rain >= 50) return "Rain likely";
  if (rain >= 30) return "Showers possible";
  return "Dry";
}

export function buildState(c: Conditions, campaignStatus: CampaignStatus = "Not running"): AppState {
  const chickenRisk: Risk =
    c.urgency === "Low" ? (c.chickenStock >= 60 ? "MEDIUM RISK" : "LOW RISK")
    : c.chickenStock >= 50 ? "HIGH RISK"
    : c.chickenStock >= 35 ? "MEDIUM RISK" : "LOW RISK";
  const bunRisk: Risk = c.urgency === "Low" ? "MEDIUM RISK" : "HIGH RISK";
  const hoursFactor = c.urgency === "Critical" ? 0.6 : c.urgency === "Low" ? 1.5 : 1;
  const delivery = c.rainProb >= 60 ? "↑" : c.rainProb >= 30 ? "↗" : "→";
  const walkIn = c.rainProb >= 60 ? "↓" : c.rainProb >= 30 ? "↘" : "→";
  const demandTag = c.demand === "Busy" ? " (busy)" : c.demand === "Quiet" ? " (quiet)" : "";
  return {
    weather: { tempC: c.tempC, condition: weatherCondition(c.rainProb), rainProb: c.rainProb },
    demand: { delivery: delivery + demandTag, walkIn },
    stockAtRisk: Math.round((c.chickenStock * 2.1 + 39) * urgencyFactor[c.urgency]),
    inventory: [
      { id: "chicken", name: "Marinated Chicken", qty: c.chickenStock, unit: "portions", hoursRemaining: Math.round(18 * hoursFactor), risk: chickenRisk },
      { id: "buns", name: "Burger Buns", qty: 45, unit: "buns", hoursRemaining: Math.round(14 * hoursFactor), risk: bunRisk },
      { id: "fries", name: "Fries", qty: 60, unit: "portions", hoursRemaining: null, stockNote: "Healthy stock", risk: "LOW RISK" },
      { id: "drinks", name: "Cold Drinks", qty: 52, unit: "units", hoursRemaining: null, stockNote: "High stock", risk: "LOW URGENCY" },
    ],
    campaignStatus,
  };
}

export function runAgentLogic(c: Conditions): Strategy {
  const rainy = c.rainProb >= 60;
  const dry = c.rainProb < 30;
  const warm = c.tempC >= 16;
  const bundle = c.chickenStock >= 60 && c.urgency !== "Low";

  const objective = bundle
    ? "Move high-risk chicken and burger bun inventory tonight without relying on a blanket discount."
    : "Protect margin tonight: lift chicken orders with a lighter offer while stock pressure stays manageable.";

  let insight: string;
  if (rainy && !warm && bundle) {
    insight =
      "Rain is expected to reduce walk-in traffic while increasing delivery behaviour. Chicken and burger buns have the highest inventory pressure. Cold drinks have excess stock, but current weather makes them a poor promotional focus. Therefore the agent prioritises delivery-focused chicken bundles while protecting margin.";
  } else {
    const weatherPart = rainy
      ? "Rain is expected to reduce walk-in traffic while increasing delivery behaviour."
      : dry
        ? "Dry conditions keep walk-in and delivery traffic balanced, so no channel bias is applied."
        : "Mixed weather gives delivery a slight edge over walk-ins.";
    const stockPart = bundle
      ? "Chicken and burger buns have the highest inventory pressure."
      : "Chicken pressure is moderate, so heavy discounting would waste margin.";
    const drinksPart = warm
      ? "Warmer temperatures make the excess cold drink stock worth promoting alongside chicken."
      : "Cold drinks have excess stock, but current weather makes them a poor promotional focus.";
    const demandPart =
      c.demand === "Quiet" ? "A quiet night calls for a stronger offer across more channels."
      : c.demand === "Busy" ? "A busy night needs only a light nudge." : "";
    const conclusion = bundle
      ? `Therefore the agent prioritises ${rainy ? "delivery-focused " : ""}chicken bundles while protecting margin.`
      : "Therefore the agent runs a smaller offer focused on protecting margin.";
    insight = [weatherPart, stockPart, drinksPart, demandPart, conclusion].filter(Boolean).join(" ");
  }

  const avoid = warm
    ? null
    : {
        item: "Cold Drinks",
        reason:
          "Cold weather reduces expected demand. Promoting this inventory now is unlikely to produce efficient conversions.",
      };

  const priceA = !bundle ? "£11.95" : c.demand === "Quiet" ? "£17.45" : c.demand === "Busy" ? "£19.95" : "£18.95";
  const itemsA = bundle ? "2 Chicken Burgers, 6 Wings, 2 Fries" : "1 Chicken Burger, 4 Wings, 1 Fries";
  const wings = c.demand === "Quiet" ? 6 : c.demand === "Busy" ? 2 : 4;
  const baseChannel = rainy ? "Delivery" : dry ? "Delivery + Walk-in" : "Delivery";
  const drinkAddon = warm ? " Plus a free cold drink." : "";

  return {
    objective,
    insight,
    avoid,
    variants: [
      {
        id: "A",
        name: rainy ? "Rainy Night Chicken Box" : "Bradford Chicken Box",
        items: itemsA,
        price: priceA,
        target: bundle ? "Groups / couples" : "Solo diners / couples",
        channel: baseChannel + (c.demand === "Quiet" ? " + SMS" : ""),
        strategy: bundle ? "Bundle discount" : "Light bundle (margin first)",
        copy: rainy
          ? `Bradford weather doing what Bradford weather does. Stay in. We'll bring dinner. Grab the Rainy Night Chicken Box tonight.${drinkAddon}`
          : `Tonight in Bradford: fresh fried chicken, done properly. Grab the Bradford Chicken Box.${drinkAddon}`,
      },
      {
        id: "B",
        name: "Free Wings Tonight",
        items: `Buy two chicken burger meals and get ${wings} wings free`,
        price: "2 meals",
        target: "Existing customers",
        channel: (dry ? "Walk-in" : "Delivery") + " + Social" + (c.demand === "Quiet" ? " + SMS" : ""),
        strategy: "Value-add promotion",
        copy: rainy
          ? `No umbrella required. Order two chicken burger meals tonight and we'll throw in ${wings} wings.${drinkAddon}`
          : `Order two chicken burger meals tonight and we'll throw in ${wings} wings.${drinkAddon}`,
      },
    ],
  };
}

export function computeResults(raw: Record<VariantId, { impressions: number; claims: number }>): Results {
  const one = (id: VariantId): VariantResult => {
    const { impressions, claims } = raw[id];
    const revenue = claims * ECONOMICS[id].revenuePerClaim;
    return {
      impressions,
      claims,
      conversion: impressions > 0 ? Math.round((claims / impressions) * 100) : 0,
      revenue: Math.round(revenue * 100) / 100,
      margin: Math.round(revenue * ECONOMICS[id].marginRate * 100) / 100,
    };
  };
  return { A: one("A"), B: one("B") };
}

export function learnLogic(results: Results): Learning {
  const a = results.A;
  const b = results.B;
  const winner: VariantId =
    b.conversion > a.conversion ? "B" : a.conversion > b.conversion ? "A" : b.margin >= a.margin ? "B" : "A";
  return winner === "B"
    ? {
        memory:
          "On cold, rainy evenings, value-add chicken bundles outperform direct price reductions while preserving more margin.",
        nextDecision:
          "Allocate more traffic to Variant B and favour value-add promotions under similar conditions.",
        confidence: "Increasing",
        campaignsObserved: 4,
        relevantLearnings: 3,
        winner,
      }
    : {
        memory:
          "On cold, rainy evenings, a clearly priced chicken bundle converts better than value-add offers for this audience.",
        nextDecision:
          "Allocate more traffic to Variant A and favour bundle pricing under similar conditions.",
        confidence: "Increasing",
        campaignsObserved: 4,
        relevantLearnings: 3,
        winner,
      };
}
