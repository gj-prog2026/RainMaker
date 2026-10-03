import { createFileRoute } from "@tanstack/react-router";
import { isMood, isTheme, localEdit, wordCount, type PostKit } from "@/lib/postkit";
import { gemmaJson, isStr } from "@/lib/gemma.server";

const SYSTEM =
  "You edit social media post content for an independent chicken shop based on the owner's instruction. " +
  "Change only what the instruction asks for. Keep offer facts accurate (items, price, bonus wings) unless the owner explicitly changes them. " +
  "Keep placeholders like [phone number] and [ordering link] unless asked. No dots or emoji bullets. British English. " +
  'Output exactly: {"caption":string,"hashtags":string[],"storyText":string,"whatsappText":string,"posterHeadline":string,"posterSubline":string,"price":string,"posterTheme":string,"voiceScript":string,"musicMood":string,"summary":string}. ' +
  "storyText max 90 characters, 6 to 8 hashtags each starting with #, no invented prices or discounts. " +
  "posterTheme: if the owner asks to change the colours or the look (lighter, brighter, warmer, bolder, cleaner, darker), choose exactly one of: charcoal, cream, sunny, red, white " +
  "(charcoal = dark original, cream = light warm, sunny = soft yellow, red = bold red, white = clean white). Otherwise return the current posterTheme. Never output hex codes or any other value. " +
  "voiceScript is the spoken narration for a 15 second video ad: 32 to 42 words, no emoji, British English, warm Yorkshire tone, ends with the offer and 'tonight only'. Only rewrite it when the owner asks about the voice, script, narration, energy or ad length. " +
  "musicMood: choose exactly one of upbeat, chill, bold when the owner asks about the music or energy; otherwise return the current value. " +
  "summary is one short sentence describing what changed, naming any new theme (e.g. 'Switched the poster to the cream theme.') or music.";

export const Route = createFileRoute("/api/edit-campaign")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const b = (await request.json().catch(() => null)) as
          | { variant?: unknown; instruction?: unknown; currentKit?: PostKit }
          | null;
        if (!b || (b.variant !== "A" && b.variant !== "B") || typeof b.instruction !== "string" || !b.currentKit)
          return new Response("Bad request", { status: 400 });
        const variant = b.variant;
        const instruction = b.instruction.slice(0, 300);
        const k: PostKit = {
          ...b.currentKit,
          posterTheme: isTheme(b.currentKit.posterTheme) ? b.currentKit.posterTheme : "charcoal",
          musicMood: isMood(b.currentKit.musicMood) ? b.currentKit.musicMood : "upbeat",
          voiceScript: typeof b.currentKit.voiceScript === "string" ? b.currentKit.voiceScript : "",
        };
        const gemmaKit = {
          caption: k.caption,
          hashtags: k.hashtags.split(/\s+/).filter(Boolean),
          storyText: k.story,
          whatsappText: k.whatsapp,
          posterHeadline: k.headline,
          posterSubline: k.items,
          price: k.price,
          posterTheme: k.posterTheme,
          voiceScript: k.voiceScript,
          musicMood: k.musicMood,
        };
        const priceAllowed = /£|price|cost/i.test(instruction);
        const res = await gemmaJson({
          task: "edit-campaign",
          system: SYSTEM,
          user: `Variant ${variant}. Owner instruction: ${JSON.stringify(instruction)}\nCurrent kit: ${JSON.stringify(gemmaKit)}`,
          timeoutMs: 20000,
          validate: (v): { kit: PostKit; summary: string } | null => {
            if (!v || typeof v !== "object") return null;
            const o = v as Record<string, unknown>;
            const pick = (f: string, cur: string) => (isStr(o[f], 4000) ? (o[f] as string) : cur);
            const tags = o["hashtags"];
            let hashtags = Array.isArray(tags)
              ? tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
              : typeof tags === "string"
                ? tags.split(/\s+/).filter(Boolean)
                : [];
            hashtags = hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, ""));
            if (hashtags.length < 3) hashtags = gemmaKit.hashtags;
            hashtags = hashtags.slice(0, 8);
            const script = pick("voiceScript", k.voiceScript);
            const wc = wordCount(script);
            const kit: PostKit = {
              headline: pick("posterHeadline", k.headline),
              items: pick("posterSubline", k.items),
              price: priceAllowed ? pick("price", k.price) : k.price,
              caption: pick("caption", k.caption),
              hashtags: hashtags.join(" "),
              story: pick("storyText", k.story).slice(0, 90),
              whatsapp: pick("whatsappText", k.whatsapp),
              posterTheme: isTheme(o["posterTheme"]) ? o["posterTheme"] : k.posterTheme,
              voiceScript: wc >= 28 && wc <= 46 ? script : k.voiceScript,
              musicMood: isMood(o["musicMood"]) ? o["musicMood"] : k.musicMood,
            };
            const changed = (Object.keys(kit) as (keyof PostKit)[]).some((f) => kit[f] !== k[f]);
            if (!changed) return null;
            return { kit, summary: pick("summary", "Updated the post as requested.") };
          },
        });
        if (res) {
          return Response.json({ kit: res.value.kit, reply: res.value.summary, changed: true, source: "gemma", model: res.model });
        }
        return Response.json({ ...localEdit(variant, instruction, k), source: "fallback", model: null });
      },
    },
  },
});
