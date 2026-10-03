import { createFileRoute } from "@tanstack/react-router";
import { getRaw, parseVariant } from "@/lib/results-store.server";
import { backend, BackendError } from "@/lib/backend.server";

export const Route = createFileRoute("/api/impression")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { variant?: unknown };
        const v = parseVariant(body.variant);
        if (!v) return new Response("Bad request", { status: 400 });
        try {
          await backend("/api/impression", { variant: v }, 2500);
          return Response.json({ ok: true });
        } catch (e) {
          // 409 = backend has no live campaign for this variant yet; don't count it anywhere.
          if (e instanceof BackendError && e.status === 409) return Response.json({ ok: false, reason: "no-active-campaign" });
        }
        getRaw()[v].impressions += 1;
        return Response.json({ ok: true });
      },
    },
  },
});
