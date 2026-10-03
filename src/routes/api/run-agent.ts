import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildState, runAgentLogic, type Strategy, type Variant } from "@/lib/agent";
import { gemmaJson, isStr } from "@/lib/gemma.server";
import { backend, mapStrategy, toBackendInput, type BRunAgent } from "@/lib/backend.server";

const schema = z.object({
  rainProb: z.number().min(0).max(100),
  tempC: z.number().min(-20).max(45),
  chickenStock: z.number().min(0).max(500),
  urgency: z.enum(["Low", "Medium", "Critical"]),
  demand: z.enum(["Quiet", "Normal", "Busy"]),
});

const SYSTEM =
  "You are an autonomous marketing agent for an independent chicken shop, Bradford Fried Chicken in Bradford, Yorkshire. " +
  "Prefer value-add bundles over blanket discounts, protect margin, and explicitly decide which stock NOT to promote and why " +
  "(for example cold drinks in cold weather). British English, warm plain Yorkshire tone, no corporate language. " +
  'Output exactly: {"objective":string,"insight":string,"avoid":{"item":string,"reason":string},"variants":[{"id":"A","name":string,"items":string,"price":number,"target":string,"channel":string,"strategy":string,"copy":string},{"id":"B",...}]}. ' +
  "Variant A is a priced bundle, variant B is a value-add offer. copy max 220 characters. price is a number in GBP (use 0 for B if it has no single price). " +
  "If nothing should be avoided, set avoid to null.";

function fmtPrice(p: unknown, fallback: string): string | null {
  if (typeof p === "number" && p > 0 && p < 100) return `£${p.toFixed(2)}`;
  if (typeof p === "number" && p === 0) return fallback;
  if (typeof p === "string" && /^£?\d+(\.\d{1,2})?$/.test(p.trim())) return `£${Number(p.replace("£", "")).toFixed(2)}`;
  return null;
}

function validate(base: Strategy) {
  return (v: unknown): Strategy | null => {
    const o = v as Record<string, unknown>;
    if (!o || !isStr(o["objective"], 400) || !isStr(o["insight"], 900)) return null;
    let avoid: Strategy["avoid"] = null;
    const a = o["avoid"] as Record<string, unknown> | null;
    if (a) {
      if (!isStr(a["item"], 60) || !isStr(a["reason"], 400)) return null;
      avoid = { item: a["item"], reason: a["reason"] };
    }
    const vs = o["variants"];
    if (!Array.isArray(vs) || vs.length !== 2) return null;
    const variants: Variant[] = [];
    for (const id of ["A", "B"] as const) {
      const x = vs.find((y: Record<string, unknown>) => y?.["id"] === id) as Record<string, unknown> | undefined;
      const b = base.variants.find((y) => y.id === id)!;
      if (!x) return null;
      const fields = ["name", "items", "target", "channel", "strategy", "copy"] as const;
      if (!fields.every((f) => isStr(x[f], f === "copy" ? 260 : 160))) return null;
      const price = fmtPrice(x["price"], b.price);
      if (!price) return null;
      variants.push({
        id,
        name: x["name"] as string,
        items: x["items"] as string,
        price,
        target: x["target"] as string,
        channel: x["channel"] as string,
        strategy: x["strategy"] as string,
        copy: (x["copy"] as string).slice(0, 220),
      });
    }
    return { objective: o["objective"], insight: o["insight"], avoid, variants };
  };
}

export const Route = createFileRoute("/api/run-agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const c = parsed.data;
        // Primary: RAINMAKER backend (decision, campaigns, experiment, memory retrieval).
        try {
          const r = await backend<BRunAgent>("/api/run-agent", toBackendInput(c), 12000);
          return Response.json(mapStrategy(r));
        } catch (e) {
          console.warn("[run-agent] backend unavailable, using local agent:", (e as Error).message);
        }
        const base = runAgentLogic(c);
        const inventory = buildState(c).inventory.map(({ name, qty, unit, hoursRemaining, risk }) => ({ name, qty, unit, hoursRemaining, risk }));
        const res = await gemmaJson({
          task: "run-agent",
          system: SYSTEM,
          user:
            `Tonight's conditions: ${JSON.stringify({ ...c, inventory })}\n` +
            `Reference plan from our rules engine (stay close to it, improve wording only where it helps): ${JSON.stringify(base)}`,
          validate: validate(base),
        });
        return Response.json(
          res ? { ...res.value, source: "gemma", model: res.model } : { ...base, source: "fallback", model: null },
        );
      },
    },
  },
});
