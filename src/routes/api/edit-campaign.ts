import { createFileRoute } from "@tanstack/react-router";
import { localEdit, type PostKit } from "@/lib/postkit";
import { gemmaJson, isStr } from "@/lib/gemma.server";

const SYSTEM =
  "You edit social media post content for an independent chicken shop based on the owner's instruction. " +
  "Change only what the instruction asks for. Keep offer facts accurate (items, price, bonus wings) unless the owner explicitly changes them. " +
  "Keep placeholders like [phone number] and [ordering link] unless asked. No dots or emoji bullets. British English. " +
  'Output exactly: {"caption":string,"hashtags":string[],"storyText":string,"whatsappText":string,"posterHeadline":string,"posterSubline":string,"price":string,"summary":string}. ' +
  "storyText max 90 characters, 6 to 8 hashtags each starting with #, no invented prices or discounts. summary is one short sentence describing what changed.";

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
        const k = b.currentKit;
        const gemmaKit = {
          caption: k.caption,
          hashtags: k.hashtags.split(/\s+/).filter(Boolean),
          storyText: k.story,
          whatsappText: k.whatsapp,
          posterHeadline: k.headline,
          posterSubline: k.items,
          price: k.price,
        };
        const priceAllowed = /£|price|cost/i.test(instruction);
        const res = await gemmaJson({
          task: "edit-campaign",
          system: SYSTEM,
          user: `Variant ${variant}. Owner instruction: ${JSON.stringify(instruction)}\nCurrent kit: ${JSON.stringify(gemmaKit)}`,
          validate: (v): { kit: PostKit; summary: string } | null => {
            const o = v as Record<string, unknown>;
            if (!o) return null;
            const strs = ["caption", "storyText", "whatsappText", "posterHeadline", "posterSubline", "price", "summary"] as const;
            if (!strs.every((f) => isStr(o[f], 2000))) return null;
            const tags = o["hashtags"];
            if (!Array.isArray(tags) || !tags.every((t) => typeof t === "string")) return null;
            let hashtags = (tags as string[]).map((t) => (t.startsWith("#") ? t : `#${t}`).replace(/\s+/g, ""));
            if (hashtags.length < 6) hashtags = gemmaKit.hashtags;
            hashtags = hashtags.slice(0, 8);
            const price = priceAllowed ? (o["price"] as string) : k.price;
            const story = (o["storyText"] as string).slice(0, 90);
            return {
              kit: {
                headline: o["posterHeadline"] as string,
                items: o["posterSubline"] as string,
                price,
                caption: o["caption"] as string,
                hashtags: hashtags.join(" "),
                story,
                whatsapp: o["whatsappText"] as string,
              },
              summary: o["summary"] as string,
            };
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
