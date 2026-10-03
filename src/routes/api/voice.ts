import { createFileRoute } from "@tanstack/react-router";
import { elevenTts } from "@/lib/eleven.server";

// Returns audio/mpeg from ElevenLabs, or JSON with fallback:true so the client uses browser speech.
export const Route = createFileRoute("/api/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { text?: unknown };
        const text = typeof body.text === "string" ? body.text.slice(0, 600) : "";
        const audio = await elevenTts(text);
        if (audio) {
          return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
        }
        return Response.json({ audioUrl: null, transcript: text, fallback: true });
      },
    },
  },
});
