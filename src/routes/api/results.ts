import { createFileRoute } from "@tanstack/react-router";
import { computeResults } from "@/lib/agent";
import { getRaw } from "@/lib/results-store.server";

export const Route = createFileRoute("/api/results")({
  server: {
    handlers: {
      GET: async () => Response.json(computeResults(getRaw()), { headers: { "cache-control": "no-store" } }),
    },
  },
});
