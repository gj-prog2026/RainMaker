import { createFileRoute } from "@tanstack/react-router";
import { parseVariant } from "@/lib/results-store.server";
import { backend, type BResults } from "@/lib/backend.server";

/** The live backend campaign for a variant, used by the /offer page. 404 when none is running. */
export const Route = createFileRoute("/api/campaign")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const v = parseVariant(new URL(request.url).searchParams.get("variant"));
        if (!v) return new Response("Bad request", { status: 400 });
        const r = await backend<BResults>("/api/results", undefined, 2500).catch(() => null);
        const c = r?.campaigns.find((x) => x.variant === v);
        if (!c) return new Response("Not found", { status: 404 });
        return Response.json(
          { title: c.name, body: c.offer, price: c.price },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
