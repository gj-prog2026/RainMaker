import { createFileRoute } from "@tanstack/react-router";
import { resetRaw } from "@/lib/results-store.server";
import { backend } from "@/lib/backend.server";

export const Route = createFileRoute("/api/reset")({
  server: {
    handlers: {
      POST: async () => {
        resetRaw();
        // Backend reset clears campaigns and counters but preserves learned memories.
        await backend("/api/reset-demo", {}).catch(() => null);
        return Response.json({ ok: true });
      },
    },
  },
});
