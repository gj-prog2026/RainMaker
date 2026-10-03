import { createFileRoute } from "@tanstack/react-router";
import { gemmaPing, getModel } from "@/lib/gemma.server";
import { elevenPing } from "@/lib/eleven.server";
import { backend } from "@/lib/backend.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const [gemma, eleven, rm] = await Promise.all([
          gemmaPing(),
          elevenPing(),
          backend<{ ok: boolean }>("/api/health", undefined, 3000).catch(() => ({ ok: false })),
        ]);
        return Response.json(
          { gemma: { ok: gemma, model: getModel("health") }, eleven: { ok: eleven }, backend: { ok: rm.ok } },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
