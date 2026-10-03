import { createFileRoute } from "@tanstack/react-router";
import { computeResults, learnLogic, type Results } from "@/lib/agent";
import { getRaw } from "@/lib/results-store.server";
import { gemmaJson, isStr } from "@/lib/gemma.server";
import { backendLearn } from "@/lib/backend.server";

const SYSTEM =
  "You are the learning module of a marketing agent for an independent chicken shop in Bradford. " +
  "The winner has already been computed from real results; explain it, do not change it. British English, plain and warm, no corporate language. " +
  'Output exactly: {"memory":string (one sentence, a reusable lesson),"nextDecision":string (one sentence),"confidence":"Increasing"|"Stable"|"Low"}.';

export const Route = createFileRoute("/api/learn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Primary: write the observation to RAINMAKER's persistent memory.
        try {
          return Response.json(await backendLearn());
        } catch (e) {
          console.warn("[learn] backend unavailable, using local learning:", (e as Error).message);
        }
        const body = (await request.json().catch(() => ({}))) as { results?: Results; conditions?: unknown };
        const results = body.results?.A && body.results?.B ? body.results : computeResults(getRaw());
        const base = learnLogic(results); // winner computed server-side
        const res = await gemmaJson({
          task: "learn",
          system: SYSTEM,
          user: `Winner: Variant ${base.winner}. Results: ${JSON.stringify(results)}. Conditions: ${JSON.stringify(body.conditions ?? null)}.`,
          validate: (v) => {
            const o = v as Record<string, unknown>;
            if (!o || !isStr(o["memory"], 300) || !isStr(o["nextDecision"], 300) || !isStr(o["confidence"], 30)) return null;
            return { memory: o["memory"], nextDecision: o["nextDecision"], confidence: o["confidence"] };
          },
        });
        return Response.json(
          res ? { ...base, ...res.value, source: "gemma", model: res.model } : { ...base, source: "fallback", model: null },
        );
      },
    },
  },
});
