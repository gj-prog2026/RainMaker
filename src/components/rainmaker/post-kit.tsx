import { useEffect, useRef, useState, type ReactNode } from "react";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { api } from "@/lib/api";
import { buildKit, PLACEHOLDERS, type PostKit } from "@/lib/postkit";
import type { Variant } from "@/lib/agent";
import { cn } from "@/lib/utils";

type Format = "feed" | "story";

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600&display=swap";
let fontCssPromise: Promise<string> | null = null;
/** Inlines brand web fonts as data URLs so exported posters use them. */
function getFontCSS(): Promise<string> {
  fontCssPromise ??= (async () => {
    try {
      let css = await (await fetch(FONT_CSS_URL)).text();
      const urls = Array.from(new Set(css.match(/https:[^)'"]+\.woff2/g) ?? []));
      await Promise.all(
        urls.map(async (u) => {
          const blob = await (await fetch(u)).blob();
          const data = await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(blob);
          });
          css = css.split(u).join(data);
        }),
      );
      return css;
    } catch {
      return "";
    }
  })();
  return fontCssPromise;
}
const SIZES: Record<Format, { w: number; h: number }> = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } };

function Poster({ kit, format }: { kit: PostKit; format: Format }) {
  const { w, h } = SIZES[format];
  const story = format === "story";
  const display = { fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif", fontWeight: 700, textTransform: "uppercase" } as const;
  return (
    <div
      style={{
        width: w,
        height: h,
        padding: 88,
        display: "flex",
        flexDirection: "column",
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "Inter, sans-serif",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div style={{ height: 18, background: "var(--primary)", flexShrink: 0 }} />
      <div style={{ ...display, marginTop: 40, fontSize: 44, letterSpacing: "0.16em", color: "var(--muted-foreground)" }}>
        Bradford Fried Chicken
      </div>
      <div style={{ ...display, marginTop: story ? 160 : 72, fontSize: story ? 190 : 156, lineHeight: 0.88 }}>{kit.headline}</div>
      <div style={{ marginTop: 44, fontSize: 50, lineHeight: 1.25, maxWidth: 860, opacity: 0.85 }}>{kit.items}</div>
      <div style={{ ...display, marginTop: story ? 96 : 40, fontSize: story ? 260 : 200, lineHeight: 0.9, color: "var(--accent)" }}>
        {kit.price}
      </div>
      <div
        style={{
          marginTop: "auto",
          borderTop: "6px solid var(--primary)",
          paddingTop: 36,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ ...display, fontSize: 58, letterSpacing: "0.04em", lineHeight: 1, marginRight: 32 }}>Tonight only in Bradford</div>
        <div style={{ ...display, fontSize: 30, letterSpacing: "0.14em", color: "var(--muted-foreground)" }}>Order tonight</div>
      </div>
    </div>
  );
}

function Scaled({ children, w, h, width }: { children: ReactNode; w: number; h: number; width: number }) {
  const s = width / w;
  return (
    <div style={{ width, height: h * s }} className="overflow-hidden">
      <div style={{ transform: `scale(${s})`, transformOrigin: "top left", width: w, height: h }}>{children}</div>
    </div>
  );
}

function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((p, i) =>
        PLACEHOLDERS.includes(p) || /^\[.+\]$/.test(p) ? (
          <mark key={i} className="rounded-[2px] bg-warning px-0.5 text-accent-foreground">{p}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Field({ label, value, onChange, rows, max }: { label: string; value: string; onChange: (v: string) => void; rows: number; max?: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const hasPh = /\[[^\]]+\]/.test(value);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="eyebrow">
          {label}
          {max ? ` · ${value.length}/${max}` : ""}
        </span>
        <button onClick={copy} className="rounded-[2px] border border-border px-2.5 py-1 font-display text-xs tracking-widest hover:bg-surface">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        value={value}
        rows={rows}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border border-border bg-background p-3 text-sm leading-relaxed outline-none focus:border-accent"
      />
      {hasPh && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
          Fill in: <Highlighted text={(value.match(/\[[^\]]+\]/g) ?? []).filter((v, i, a) => a.indexOf(v) === i).join("  ")} />
        </p>
      )}
    </div>
  );
}

type Msg = { from: "owner" | "agent"; text: string; gemma?: boolean };

export function PostKitModal({ variant, onClose }: { variant: Variant; onClose: () => void }) {
  const [versions, setVersions] = useState<PostKit[]>(() => [buildKit(variant)]);
  const [current, setCurrent] = useState(0);
  const [kit, setKit] = useState<PostKit>(versions[0]!);
  const [msgs, setMsgs] = useState<Msg[]>([
    { from: "agent", text: "Here's v1 of your post kit. Tell me what to change, e.g. 'make it shorter' or 'change the price to £17.95'." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const slug = `bradford-fried-chicken-variant-${variant.id.toLowerCase()}`;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const set = (k: keyof PostKit) => (v: string) => setKit((p) => ({ ...p, [k]: v }));

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { from: "owner", text }]);
    setBusy(true);
    const res = await api.editCampaign(variant.id, text, kit);
    if (res.changed) {
      const next = [...versions, res.kit];
      setVersions(next);
      setCurrent(next.length - 1);
      setKit(res.kit);
      setMsgs((m) => [...m, { from: "agent", text: `${res.reply} Saved as v${next.length}.`, gemma: res.source === "gemma" }]);
    } else {
      setMsgs((m) => [...m, { from: "agent", text: res.reply }]);
    }
    setBusy(false);
  };

  const restore = (i: number) => {
    setCurrent(i);
    setKit(versions[i]!);
    setMsgs((m) => [...m, { from: "agent", text: `Restored v${i + 1}.` }]);
  };

  const render = async (f: Format) => {
    const node = (f === "feed" ? feedRef : storyRef).current;
    if (!node) throw new Error("missing");
    const { w, h } = SIZES[f];
    await document.fonts.ready;
    const fontEmbedCSS = await getFontCSS();
    return toPng(node, { width: w, height: h, pixelRatio: 1, cacheBust: true, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
  };
  const save = (href: string, name: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
  };
  const captionTxt = () => `${kit.caption}\n\n${kit.hashtags}\n`;
  const run = async (label: string, fn: () => Promise<void>) => {
    setExporting(label);
    try {
      await fn();
    } catch {
      setMsgs((m) => [...m, { from: "agent", text: "That download didn't finish. Please try again." }]);
    }
    setExporting(null);
  };
  const dl = {
    feed: () => run("feed", async () => save(await render("feed"), `${slug}-feed.png`)),
    story: () => run("story", async () => save(await render("story"), `${slug}-story.png`)),
    caption: () =>
      run("caption", async () => {
        const url = URL.createObjectURL(new Blob([captionTxt()], { type: "text/plain" }));
        save(url, `${slug}-caption.txt`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
    all: () =>
      run("all", async () => {
        const zip = new JSZip();
        const [feed, story] = [await render("feed"), await render("story")];
        zip.file(`${slug}-feed.png`, feed.split(",")[1]!, { base64: true });
        zip.file(`${slug}-story.png`, story.split(",")[1]!, { base64: true });
        zip.file(`${slug}-caption.txt`, captionTxt());
        zip.file(`${slug}-story-text.txt`, kit.story);
        zip.file(`${slug}-whatsapp.txt`, kit.whatsapp);
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        save(url, `${slug}-post-kit.zip`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }),
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/90 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="mx-auto my-6 max-w-[1280px] rounded-md border border-border bg-card p-5 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="min-w-0">
            <div className="eyebrow text-accent">Variant {variant.id} · Post kit</div>
            <h2 className="truncate text-3xl">{kit.headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Copy, download and upload yourself. Nothing is posted automatically.</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-[2px] border border-border px-4 py-2 font-display text-sm tracking-widest hover:bg-surface">
            Close
          </button>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)_minmax(0,0.9fr)]">
          {/* A) Preview */}
          <div>
            <div className="eyebrow mb-2">Preview</div>
            <div className="mx-auto w-[320px] rounded-[2.25rem] border-[9px] border-surface bg-background">
              <div className="flex items-center gap-2 px-3 py-2.5">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-primary font-display text-[10px] text-primary-foreground">BFC</div>
                <span className="text-xs font-semibold">bradfordfriedchicken</span>
              </div>
              <Scaled w={1080} h={1350} width={302}>
                <Poster kit={kit} format="feed" />
              </Scaled>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 py-3 text-xs leading-relaxed">
                <span className="font-semibold">bradfordfriedchicken </span>
                <Highlighted text={kit.caption} />
                <div className="mt-2 text-accent">{kit.hashtags}</div>
              </div>
            </div>
          </div>

          {/* B) Templates */}
          <div className="space-y-4">
            <div className="eyebrow">Copy-paste post</div>
            <Field label="Caption" value={kit.caption} onChange={set("caption")} rows={7} />
            <Field label="Hashtags" value={kit.hashtags} onChange={set("hashtags")} rows={2} />
            <Field label="Story text" value={kit.story} onChange={set("story")} rows={2} max={90} />
            <Field label="WhatsApp message" value={kit.whatsapp} onChange={set("whatsapp")} rows={5} />

            <div className="border-t border-border pt-4">
              <div className="eyebrow mb-2">Upload-ready files</div>
              <div className="grid grid-cols-2 gap-2">
                <DlBtn onClick={dl.feed} busy={exporting === "feed"}>Poster feed PNG</DlBtn>
                <DlBtn onClick={dl.story} busy={exporting === "story"}>Poster story PNG</DlBtn>
                <DlBtn onClick={dl.caption} busy={exporting === "caption"}>caption.txt</DlBtn>
                <DlBtn onClick={dl.all} busy={exporting === "all"} primary>Download all (.zip)</DlBtn>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Feed 1080×1350 · Story 1080×1920</p>
            </div>
          </div>

          {/* Chat */}
          <div className="flex min-h-[520px] flex-col rounded-md border border-border bg-background">
            <div className="border-b border-border p-3">
              <div className="font-display text-lg tracking-wider">Request changes</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {versions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => restore(i)}
                    disabled={i === current}
                    title={i === current ? "Current version" : `Restore v${i + 1}`}
                    className={cn(
                      "rounded-[2px] border px-2 py-0.5 font-display text-xs tracking-widest",
                      i === current ? "border-accent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    v{i + 1}
                    {i !== current ? " · Restore" : ""}
                  </button>
                ))}
              </div>
            </div>
            <div ref={chatRef} className="flex-1 space-y-2 overflow-y-auto p-3">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[88%] rounded-md px-3 py-2 text-sm",
                    m.from === "owner" ? "ml-auto bg-foreground text-background" : "text-card-foreground/90",
                  )}
                >
                  {m.text}
                  {m.gemma && <div className="eyebrow mt-1 text-[10px]">Powered by Gemma 4</div>}
                </div>
              ))}
              {busy && <div className="text-sm text-muted-foreground">Updating…</div>}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-center gap-2 border-t border-border p-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. sound more Yorkshire"
                className="min-w-0 flex-1 rounded-md bg-card px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-accent"
              />
              <span title="Voice coming soon" className="shrink-0">
                <button
                  type="button"
                  disabled
                  aria-label="Voice coming soon"
                  className="grid h-10 w-10 cursor-not-allowed place-items-center rounded-md border border-border text-muted-foreground opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
              </span>
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="shrink-0 rounded-md bg-primary px-4 py-2.5 font-display text-sm tracking-widest text-primary-foreground disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Full-size off-screen render targets for export */}
      <div aria-hidden style={{ position: "fixed", left: -20000, top: 0, pointerEvents: "none" }}>
        <div ref={feedRef}>
          <Poster kit={kit} format="feed" />
        </div>
        <div ref={storyRef}>
          <Poster kit={kit} format="story" />
        </div>
      </div>
    </div>
  );
}

function DlBtn({ children, onClick, busy, primary }: { children: ReactNode; onClick: () => void; busy: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "rounded-[2px] px-3 py-3 font-display text-sm tracking-widest transition disabled:opacity-60",
        primary ? "bg-primary text-primary-foreground hover:brightness-110" : "border border-border hover:bg-surface",
      )}
    >
      {busy ? "Preparing…" : children}
    </button>
  );
}
