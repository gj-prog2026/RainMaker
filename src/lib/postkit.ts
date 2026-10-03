import type { Variant, VariantId } from "./agent";

export interface PostKit {
  headline: string;
  items: string;
  price: string;
  caption: string;
  hashtags: string;
  story: string;
  whatsapp: string;
  posterTheme: PosterTheme;
  voiceScript: string;
  musicMood: MusicMood;
}

export const THEME_IDS = ["charcoal", "cream", "sunny", "red", "white"] as const;
export type PosterTheme = (typeof THEME_IDS)[number];
export const MOODS = ["upbeat", "chill", "bold"] as const;
export type MusicMood = (typeof MOODS)[number];

export interface ThemePalette { label: string; bg: string; text: string; accent: string; muted: string; rule: string }
/** Poster palettes. Flat colours only; all pass readable contrast. */
export const THEMES: Record<PosterTheme, ThemePalette> = {
  charcoal: { label: "Charcoal", bg: "#1C1B1A", text: "#F5F1EA", accent: "#F26B1D", muted: "#A8A29A", rule: "#E4372B" },
  cream: { label: "Cream", bg: "#FBF3E4", text: "#1C1B1A", accent: "#C9281D", muted: "#5F574F", rule: "#C9281D" },
  sunny: { label: "Sunny", bg: "#FFE7A3", text: "#1C1B1A", accent: "#B8241A", muted: "#57493A", rule: "#B8241A" },
  red: { label: "Red", bg: "#E4372B", text: "#FBF6EE", accent: "#FFC14D", muted: "#FFDCD6", rule: "#FBF6EE" },
  white: { label: "White", bg: "#FFFFFF", text: "#1C1B1A", accent: "#C9281D", muted: "#5F5A55", rule: "#C9281D" },
};
export const isTheme = (v: unknown): v is PosterTheme => typeof v === "string" && (THEME_IDS as readonly string[]).includes(v);
export const isMood = (v: unknown): v is MusicMood => typeof v === "string" && (MOODS as readonly string[]).includes(v);
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function buildVoiceScript(v: Variant): string {
  const offer = v.id === "A" ? `all for just ${v.price}` : "with free wings on us";
  return `Ey up, Bradford. Rain outside? Stay in, stay warm. Bradford Fried Chicken has you sorted with the ${v.name}: ${v.items}. Delivered hot. Order now, ${offer}, tonight only.`;
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
    posterTheme: "charcoal",
    voiceScript: buildVoiceScript(v),
    musicMood: v.id === "A" ? "upbeat" : "bold",
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

  const theme: PosterTheme | null = /darker|original/.test(t)
    ? "charcoal"
    : /sunny|warmer/.test(t)
      ? "sunny"
      : /lighter|brighter|softer/.test(t)
        ? "cream"
        : /bolder/.test(t)
          ? "red"
          : /cleaner|white/.test(t)
            ? "white"
            : null;
  if (theme && theme !== k.posterTheme) {
    k.posterTheme = theme;
    done.push(`switched the poster to the ${theme} theme`);
  }
  const mood: MusicMood | null = /chill|calm/.test(t) ? "chill" : /\bbold\b|loud/.test(t) ? "bold" : /upbeat|fun/.test(t) ? "upbeat" : null;
  if (mood && mood !== k.musicMood) {
    k.musicMood = mood;
    done.push(`switched to ${mood} music`);
  }

  if (!done.length) {
    return {
      kit,
      changed: false,
      reply: "I couldn't apply that one. Try: make the poster lighter, make it shorter, or chill music.",
    };
  }
  const msg = done.join(", ");
  return { kit: k, changed: true, reply: `Done: ${msg.charAt(0).toUpperCase()}${msg.slice(1)}.` };
}
