import type { Variant, VariantId } from "./agent";

export interface PostKit {
  headline: string;
  items: string;
  price: string;
  caption: string;
  hashtags: string;
  story: string;
  whatsapp: string;
}

export interface EditResult {
  kit: PostKit;
  reply: string;
  changed: boolean;
  source?: "gemma" | "fallback";
  model?: string | null;
}

export const PLACEHOLDERS = ["[phone number]", "[ordering link]", "[opening hours]"];

export function buildKit(v: Variant): PostKit {
  const priceLine = v.id === "A" ? `Just ${v.price}.` : "Two meals, free wings on us.";
  const hook = v.copy.split(". ")[0] + ".";
  return {
    headline: v.name,
    items: v.items,
    price: v.id === "A" ? v.price : "Free wings",
    caption: [
      hook,
      "",
      `${v.name}: ${v.items}. ${priceLine}`,
      "Order via delivery tonight.",
      "Open tonight [opening hours].",
      "Order here: [ordering link] or call [phone number].",
    ].join("\n"),
    hashtags: "#Bradford #BradfordFood #Yorkshire #YorkshireEats #FriedChicken #ChickenShop #BradfordFriedChicken #TonightOnly",
    story: clip(`${v.name} tonight. ${v.id === "A" ? v.price : "Free wings"}. Bradford only.`, 90),
    whatsapp: [
      `Evening from Bradford Fried Chicken! ${hook}`,
      `Tonight only: ${v.name}. ${v.items}. ${priceLine}`,
      "Order: [ordering link]",
      "Call: [phone number]",
    ].join("\n"),
  };
}

function clip(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

/** Simple deterministic edit rules. A real AI editor can replace this. */
export function localEdit(_variant: VariantId, instruction: string, kit: PostKit): EditResult {
  const t = instruction.toLowerCase();
  let k = { ...kit };
  const done: string[] = [];

  const price = instruction.match(/£\s?(\d+(?:\.\d{1,2})?)/);
  if (price) {
    const np = `£${Number(price[1]).toFixed(2)}`;
    const re = /£\d+(?:\.\d{2})?/g;
    k = { ...k, price: k.price.startsWith("£") ? np : k.price, caption: k.caption.replace(re, np), story: k.story.replace(re, np), whatsapp: k.whatsapp.replace(re, np) };
    done.push(`price set to ${np}`);
  }
  if (/short|trim|concise|cut/.test(t)) {
    const lines = k.caption.split("\n").filter(Boolean);
    k.caption = [lines[0], lines[1], lines[lines.length - 1]].filter(Boolean).join("\n");
    k.story = clip(k.story.split(". ").slice(0, 2).join(". "), 60);
    k.whatsapp = k.whatsapp.split("\n").slice(1).join("\n");
    done.push("made it shorter");
  }
  if (/long|more detail|expand/.test(t)) {
    k.caption = k.caption.replace("Order via delivery tonight.", "Cooked fresh, packed hot, at your door fast.\nOrder via delivery tonight.");
    done.push("added more detail");
  }
  if (/yorkshire|local|northern/.test(t)) {
    k.caption = "Ey up, Bradford. " + k.caption;
    k.whatsapp = k.whatsapp.replace("Evening from", "Ey up from");
    k.story = clip("Ey up! " + k.story, 90);
    done.push("gave it a Yorkshire voice");
  }
  if (/friday/.test(t)) {
    k.caption = k.caption.replace("Order via delivery tonight.", "Order via delivery tonight.\nFriday deal: same offer runs Friday night too.");
    k.whatsapp += "\nFriday deal: back again Friday night.";
    done.push("added a Friday deal");
  }
  if (/emoji/.test(t)) {
    const strip = (s: string) => s.replace(EMOJI, "").replace(/ {2,}/g, " ");
    k = { ...k, caption: strip(k.caption), story: strip(k.story), whatsapp: strip(k.whatsapp), hashtags: strip(k.hashtags) };
    done.push("removed emojis");
  }
  if (/hashtag|#/.test(t)) {
    const tag = instruction.match(/#\w+/)?.[0] ?? "#BradfordEats";
    if (!k.hashtags.includes(tag)) k.hashtags = `${k.hashtags} ${tag}`;
    done.push(`added ${tag}`);
  }

  if (!done.length) {
    return {
      kit,
      changed: false,
      reply: "I'll be able to handle that once live editing is connected. Try something like 'make it shorter'.",
    };
  }
  const msg = done.join(", ");
  return { kit: k, changed: true, reply: `Done: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}.` };
}
