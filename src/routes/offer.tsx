import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { VariantId } from "@/lib/agent";

type Search = { variant: VariantId; preview?: boolean | undefined };

export const Route = createFileRoute("/offer")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    variant: s["variant"] === "B" ? "B" : "A",
    preview: s["preview"] === true || s["preview"] === "1" || s["preview"] === 1 ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Rain Outside. Chicken Inside. | Bradford Fried Chicken" },
      { name: "description", content: "Tonight only in Bradford: claim tonight's Bradford Fried Chicken offer." },
      { property: "og:title", content: "Rain Outside. Chicken Inside. | Bradford Fried Chicken" },
      { property: "og:description", content: "Tonight only in Bradford. Claim tonight's offer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfferPage,
});

const OFFERS: Record<VariantId, { title: string; body: string; price?: string }> = {
  A: { title: "Rainy Night Chicken Box", body: "2 Chicken Burgers · 6 Wings · 2 Fries", price: "£18.95" },
  B: { title: "Free Wings Tonight", body: "Order two chicken burger meals and receive 4 wings free." },
};

function OfferPage() {
  const { variant, preview } = Route.useSearch();
  const offer = OFFERS[variant];
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    if (preview) return;
    try {
      if (sessionStorage.getItem(`rm-claim-${variant}`)) setClaimed(true);
      if (sent.current || sessionStorage.getItem(`rm-imp-${variant}`)) return;
      sent.current = true;
      sessionStorage.setItem(`rm-imp-${variant}`, "1");
    } catch {
      /* ignore */
    }
    void api.impression(variant);
  }, [variant, preview]);

  const claim = async () => {
    if (claimed || busy) return;
    setBusy(true);
    if (!preview) {
      try {
        sessionStorage.setItem(`rm-claim-${variant}`, "1");
      } catch {
        /* ignore */
      }
      await api.claim(variant);
    }
    setBusy(false);
    setClaimed(true);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[140%] -translate-x-1/2 rounded-full bg-primary/25 blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 pb-8 pt-8">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg tracking-[0.12em]">Bradford Fried Chicken</span>
          <span className="rounded-full bg-primary px-3 py-1 font-display text-xs tracking-widest text-primary-foreground">
            Tonight
          </span>
        </div>

        <div className="mt-12">
          <h1 className="text-[3.6rem] leading-[0.88]">
            Rain outside.
            <br />
            <span className="bg-fire bg-clip-text text-transparent">Chicken inside.</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">Tonight only in Bradford.</p>
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-glow">
          <div className="eyebrow">Tonight's offer</div>
          <h2 className="mt-2 text-4xl leading-none">{offer.title}</h2>
          <p className="mt-3 text-base text-card-foreground/85">{offer.body}</p>
          {offer.price && <div className="mt-5 font-display text-6xl text-accent">{offer.price}</div>}
        </div>

        <div className="mt-auto pt-10">
          {!claimed ? (
            <button
              onClick={claim}
              disabled={busy}
              className="w-full rounded-2xl bg-primary py-6 font-display text-2xl tracking-wider text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-70"
            >
              {busy ? "Claiming…" : "Claim tonight's offer"}
            </button>
          ) : (
            <div className="animate-in fade-in zoom-in-95 rounded-2xl border border-success/40 bg-success/10 p-6 text-center duration-500">
              <div className="font-display text-3xl text-success">✓ Offer claimed</div>
              <p className="mt-3 text-lg font-semibold">You've just influenced RAINMAKER's next decision.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Your response becomes part of the live campaign experiment.
              </p>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-muted-foreground">Show this screen in store or at delivery checkout.</p>
        </div>
      </div>
    </main>
  );
}
