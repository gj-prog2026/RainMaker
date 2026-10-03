import { createFileRoute } from "@tanstack/react-router";
import { gemmaPing, getModel } from "@/lib/gemma.server";
import { elevenPing } from "@/lib/eleven.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const [gemma, eleven] = await Promise.all([gemmaPing(), elevenPing()]);
        return Response.json(
          { gemma: { ok: gemma, model: getModel("health") }, eleven: { ok: eleven } },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
