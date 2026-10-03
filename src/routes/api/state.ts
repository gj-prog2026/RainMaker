import { createFileRoute } from "@tanstack/react-router";
import { buildState, DEFAULT_CONDITIONS } from "@/lib/agent";

export const Route = createFileRoute("/api/state")({
  server: {
    handlers: {
      GET: async () => Response.json(buildState(DEFAULT_CONDITIONS)),
    },
  },
});
