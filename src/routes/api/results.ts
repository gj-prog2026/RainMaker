import { createFileRoute } from "@tanstack/react-router";
import { computeResults } from "@/lib/agent";
import { getRaw } from "@/lib/results-store.server";
import { backend, mapResults, type BResults } from "@/lib/backend.server";

export const Route = createFileRoute("/api/results")({
  server: {
    handlers: {
      GET: async () => {
        const headers = { "cache-control": "no-store" };
        try {
          const r = await backend<BResults>("/api/results", undefined, 2500);
          return Response.json(mapResults(r.experiment), { headers });
        } catch {
          return Response.json(computeResults(getRaw()), { headers });
        }
      },
    },
  },
});
