import { createFileRoute } from "@tanstack/react-router";
import { resetRaw } from "@/lib/results-store.server";

export const Route = createFileRoute("/api/reset")({
  server: {
    handlers: {
      POST: async () => {
        resetRaw();
        return Response.json({ ok: true });
      },
    },
  },
});
