import { createFileRoute } from "@tanstack/react-router";
import { getRaw, parseVariant } from "@/lib/results-store.server";

export const Route = createFileRoute("/api/impression")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { variant?: unknown };
        const v = parseVariant(body.variant);
        if (!v) return new Response("Bad request", { status: 400 });
        getRaw()[v].impressions += 1;
        return Response.json({ ok: true });
      },
    },
  },
});
