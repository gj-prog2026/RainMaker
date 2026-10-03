import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, playVoice, subscribeDegraded } from "@/lib/api";
import {
  buildState,
  computeResults,
  DEFAULT_CONDITIONS,
  SEED_RAW,
  type CampaignStatus,
  type Conditions,
  type DemandLevel,
  type Learning,
  type Results,
  type Strategy,
  type Urgency,
  type Variant,
  type VariantId,
} from "@/lib/agent";
import {
  LoopBar,
  Panel,
  RiskBadge,
  Segmented,
  Slider,
  Waveform,
  gbp,
  useAnimatedNumber,
} from "@/components/rainmaker/parts";
import { cn } from "@/lib/utils";
import { PostKitModal } from "@/components/rainmaker/post-kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RAINMAKER | Demand agent for Bradford Fried Chicken" },
      {
        name: "description",
        content: "Turn tonight's stock into tonight's demand. RAINMAKER plans, tests and learns from chicken shop campaigns.",
      },
      { property: "og:title", content: "RAINMAKER | Turn tonight's stock into tonight's demand" },
      { property: "og:description", content: "An autonomous marketing and demand agent for independent chicken shops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const RUN_STAGES = ["Observing", "Analysing risk", "Retrieving memory", "Creating strategy", "Designing experiment"];
const OBSERVE_CHIPS = ["Stock", "Weather", "Demand", "Past campaigns"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Dashboard() {
  const [cond, setCond] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [status, setStatus] = useState<CampaignStatus>("Not running");
  const [loop, setLoop] = useState(0);
  const [runStage, setRunStage] = useState(-1);
  const [chips, setChips] = useState(0);
  const [running, setRunning] = useState(false);
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [launched, setLaunched] = useState<Record<VariantId, boolean>>({ A: false, B: false });
  const [results, setResults] = useState<Results>(computeResults(SEED_RAW));
  const [learning, setLearning] = useState<Learning | null>(null);
  const [learnPhase, setLearnPhase] = useState<"idle" | "weighing" | "writing" | "done">("idle");
  const [preview, setPreview] = useState<VariantId | null>(null);
  const [degraded, setDegraded] = useState(false);
  const strategyRef = useRef<HTMLDivElement>(null);

  const state = useMemo(() => buildState(cond, status), [cond, status]);
  const update = <K extends keyof Conditions>(k: K, v: Conditions[K]) => setCond((c) => ({ ...c, [k]: v }));

  useEffect(() => subscribeDegraded(setDegraded), []);
  useEffect(() => {
    void api.results().then(setResults);
  }, []);

  // Poll results while running
  useEffect(() => {
    if (status !== "Running") return;
    const id = setInterval(() => void api.results().then(setResults), 2000);
    return () => clearInterval(id);
  }, [status]);

  const reset = useCallback(async () => {
    await api.reset();
    setCond(DEFAULT_CONDITIONS);
    setStatus("Not running");
    setLoop(0);
    setRunStage(-1);
    setChips(0);
    setStrategy(null);
    setLaunched({ A: false, B: false });
    setLearning(null);
    setLearnPhase("idle");
    setResults(await api.results());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "r") {
        e.preventDefault();
        void reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reset]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setStrategy(null);
    setLearning(null);
    setLearnPhase("idle");
    setLoop(0);
    setChips(0);
    const pending = api.runAgent(cond);
    setRunStage(0);
    for (let i = 1; i <= 4; i++) {
      await sleep(450);
      setChips(i);
    }
    await sleep(300);
    setLoop(1);
    for (let s = 1; s < RUN_STAGES.length; s++) {
      setRunStage(s);
      await sleep(1500);
    }
    const result = await pending;
    setRunStage(RUN_STAGES.length);
    setStrategy(result);
    setLoop(2);
    setRunning(false);
    setTimeout(() => strategyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  const launch = (id: VariantId) => {
    setLaunched((l) => ({ ...l, [id]: true }));
    setStatus("Running");
    setLoop(3);
    setLearning(null);
    setLearnPhase("idle");
  };

  const learn = async () => {
    setStatus("Learning");
    setLoop(4);
    setLearnPhase("weighing");
    const latest = await api.results();
    setResults(latest);
    await sleep(1600);
    setLearnPhase("writing");
    const l = await api.learn(latest, cond);
    await sleep(1500);
    setLearning(l);
    setLearnPhase("done");
    setTimeout(() => setLoop(5), 1800);
  };

  const anyLaunched = launched.A || launched.B;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <header className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <span className="eyebrow">Bradford Fried Chicken · Bradford, Yorkshire</span>
            <h1 className="mt-2 text-6xl leading-none tracking-tight md:text-7xl">
              Rain<span className="text-primary">maker</span>
            </h1>
            <p className="mt-2 text-lg text-muted-foreground">Turn tonight's stock into tonight's demand.</p>
          </div>
          <QrPair />
        </header>

        {degraded && (
          <p className="mt-4 text-xs text-warning">Live service unavailable. Showing last successful strategy.</p>
        )}

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Weather" value={`${state.weather.tempC}°C`} sub={`${state.weather.condition} · ${state.weather.rainProb}% rain`} />
          <Summary
            label="Expected demand"
            value={`Delivery ${state.demand.delivery.split(" ")[0]}`}
            sub={`Walk-ins ${state.demand.walkIn} · ${cond.demand} night`}
          />
          <Summary label="Stock at risk" value={`£${state.stockAtRisk}`} sub="Estimated inventory value" tone="danger" />
          <Summary
            label="Campaign status"
            value={status}
            sub={anyLaunched ? `Live: ${(["A", "B"] as const).filter((v) => launched[v]).join(" + ")}` : "Awaiting strategy"}
            tone={status === "Running" ? "live" : status === "Learning" ? "accent" : undefined}
          />
        </div>

        <div className="mt-4">
          <LoopBar stage={loop} />
        </div>

        {/* Signals + context + controls */}
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <h2 className="mb-3 text-2xl">Tonight's signals</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {state.inventory.map((item) => {
                const urgent = item.risk === "HIGH RISK";
                const medium = item.risk === "MEDIUM RISK";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "relative overflow-hidden rounded-2xl border border-border bg-card p-5",
                    )}
                  >
                    {(urgent || medium) && (
                      <div className={cn("absolute inset-y-0 left-0 w-1", urgent ? "bg-primary" : "bg-warning")} />
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-xl">{item.name}</h3>
                      <RiskBadge risk={item.risk} />
                    </div>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className={cn("font-display text-5xl", urgent ? "text-foreground" : "text-foreground/80")}>
                        {item.qty}
                      </span>
                      <span className="text-sm text-muted-foreground">{item.unit}</span>
                    </div>
                    <p className={cn("mt-1 text-sm", urgent ? "text-primary" : "text-muted-foreground")}>
                      {item.hoursRemaining != null ? `${item.hoursRemaining} hours remaining` : item.stockNote}
                    </p>
                  </div>
                );
              })}
            </div>

            <Panel className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="eyebrow">Weather · Context</div>
                  <div className="mt-1 font-display text-3xl">
                    {cond.tempC}°C · {state.weather.condition} · {cond.rainProb}%
                  </div>
                </div>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-card-foreground/85">
                <li className="border-l-2 border-accent pl-3">
                  {cond.rainProb >= 30
                    ? "Rainy evenings reduce walk-in traffic but increase delivery demand."
                    : "Dry evenings keep walk-in and delivery traffic balanced."}
                </li>
                <li className="border-l-2 border-accent pl-3">
                  {cond.tempC < 16
                    ? "Cold drink promotions historically underperform during cold evenings."
                    : "Warm evenings lift cold drink attach rates on chicken orders."}
                </li>
              </ul>
            </Panel>
          </div>

          <div className="flex flex-col gap-4">
            <Panel>
              <h2 className="text-2xl">Conditions</h2>
              <div className="mt-5 space-y-5">
                <Slider label="Rain probability" value={cond.rainProb} min={0} max={100} suffix="%" onChange={(v) => update("rainProb", v)} />
                <Slider label="Temperature" value={cond.tempC} min={0} max={25} suffix="°C" onChange={(v) => update("tempC", v)} />
                <Slider label="Chicken stock" value={cond.chickenStock} min={20} max={100} suffix="" onChange={(v) => update("chickenStock", v)} />
                <Segmented<Urgency> label="Stock urgency" options={["Low", "Medium", "Critical"]} value={cond.urgency} onChange={(v) => update("urgency", v)} />
                <Segmented<DemandLevel> label="Expected demand" options={["Quiet", "Normal", "Busy"]} value={cond.demand} onChange={(v) => update("demand", v)} />
              </div>
            </Panel>
            <button
              onClick={run}
              disabled={running}
              className="group rounded-2xl bg-fire px-6 py-6 font-display text-3xl tracking-[0.12em] text-primary-foreground shadow-glow transition hover:brightness-110 active:scale-[0.99] disabled:opacity-80"
            >
              {running ? "Rainmaker is thinking…" : strategy ? "Run Rainmaker again" : "Run Rainmaker"}
            </button>
          </div>
        </div>

        {/* Run sequence */}
        {runStage >= 0 && (
          <Panel className="mt-8">
            <div className="grid gap-2 md:grid-cols-5">
              {RUN_STAGES.map((s, i) => {
                const done = runStage > i;
                const active = runStage === i;
                return (
                  <div
                    key={s}
                    className={cn(
                      "rounded-xl border p-4 transition-all duration-500",
                      active && "border-accent bg-accent/10",
                      done && "border-success/40 bg-success/5",
                      !active && !done && "border-border opacity-50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-xs tracking-widest text-muted-foreground">0{i + 1}</span>
                      {done ? <span className="font-display text-xs tracking-widest text-success">Done</span> : null}
                    </div>
                    <div className="mt-1 font-display text-lg tracking-wider">{s}</div>
                    {i === 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {OBSERVE_CHIPS.map((c, ci) => (
                          <span
                            key={c}
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] transition-all duration-300",
                              chips > ci ? "bg-success/15 text-success" : "bg-surface text-muted-foreground",
                            )}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Strategy */}
        {strategy && (
          <div ref={strategyRef} className="mt-8 scroll-mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Panel className="border-accent/40">
                <div className="flex items-center justify-between gap-3">
                  <div className="eyebrow text-accent">Primary objective</div>
                  {strategy.source === "gemma" && <span className="eyebrow">Powered by Gemma 4</span>}
                </div>
                <p className="mt-2 font-display text-3xl leading-tight normal-case">{strategy.objective}</p>
                <div className="eyebrow mt-6">Key insight</div>
                <p className="mt-2 leading-relaxed text-card-foreground/85">{strategy.insight}</p>
              </Panel>
              {strategy.avoid ? (
                <section className="rounded-2xl border-2 border-dashed border-muted-foreground/40 bg-background p-5">
                  <div className="flex items-center gap-2">
                    <span className="eyebrow">Avoid promoting</span>
                  </div>
                  <h3 className="mt-3 text-3xl text-muted-foreground line-through decoration-primary decoration-2">
                    {strategy.avoid.item}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{strategy.avoid.reason}</p>
                  <p className="mt-4 text-xs text-muted-foreground/80">The agent chose not to market this tonight.</p>
                </section>
              ) : (
                <section className="rounded-2xl border border-success/40 bg-success/5 p-5">
                  <div className="eyebrow text-success">Promote alongside</div>
                  <h3 className="mt-3 text-3xl">Cold Drinks</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Warm enough for cold drinks to convert. Added as a free extra to tonight's offers.
                  </p>
                </section>
              )}
            </div>

            <h2 className="mb-3 mt-8 text-2xl">Campaign experiment</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {strategy.variants.map((v) => (
                <VariantCard key={v.id} v={v} launched={launched[v.id]} onPreview={() => setPreview(v.id)} onLaunch={() => launch(v.id)} />
              ))}
            </div>
          </div>
        )}

        {/* Live experiment */}
        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-2xl">Live experiment</h2>
          {status === "Running" && (
            <span className="flex items-center gap-2 font-display text-sm tracking-widest text-primary">
Live · updating every 2s
            </span>
          )}
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {(["A", "B"] as const).map((id) => (
            <LiveCard
              key={id}
              id={id}
              name={strategy?.variants.find((v) => v.id === id)?.name ?? (id === "A" ? "Rainy Night Chicken Box" : "Free Wings Tonight")}
              r={results[id]}
              live={launched[id]}
              winner={learning?.winner === id}
            />
          ))}
        </div>

        {/* Learn */}
        <div className="mt-8">
          <button
            onClick={learn}
            disabled={!anyLaunched || learnPhase === "weighing" || learnPhase === "writing"}
            className="w-full rounded-2xl border-2 border-accent px-6 py-5 font-display text-2xl tracking-[0.12em] text-accent transition hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground disabled:hover:bg-transparent"
          >
            {learnPhase === "weighing"
              ? "Weighing results…"
              : learnPhase === "writing"
                ? "Writing memory…"
                : anyLaunched
                  ? "Learn from results"
                  : "Launch a variant to learn"}
          </button>

          {(learnPhase === "weighing" || learnPhase === "writing") && (
            <Panel className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <LearnStep label="Weighing conversion & margin" done={learnPhase === "writing"} active={learnPhase === "weighing"} />
                <LearnStep label="Writing agent memory" done={false} active={learnPhase === "writing"} />
              </div>
            </Panel>
          )}

          {learning && learnPhase === "done" && (
            <div className="mt-4 grid gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Panel className="border-success/40">
                <div className="eyebrow text-success">Agent memory updated</div>
                <p className="mt-2 font-display text-2xl leading-snug normal-case">{learning.memory}</p>
                <div className="eyebrow mt-6 text-accent">Next decision</div>
                <p className="mt-2 text-lg">{learning.nextDecision}</p>
              </Panel>
              <Panel>
                <Stat label="Winner" value={`Variant ${learning.winner}`} />
                <Stat label="Memory confidence" value={learning.confidence} />
                <Stat label="Campaigns observed" value={String(learning.campaignsObserved)} />
                <Stat label="Relevant past learnings" value={String(learning.relevantLearnings)} />
              </Panel>
            </div>
          )}
        </div>

        <footer className="mt-16 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>RAINMAKER · demand agent prototype</span>
          <HealthCheck />
          <button onClick={() => void reset()} className="opacity-40 hover:opacity-100" title="Ctrl/Cmd + Shift + R">
            reset demo
          </button>
        </footer>
      </div>

      {preview && strategy && (
        <PostKitModal
          key={preview + strategy.variants.map((v) => v.copy).join()}
          variant={strategy.variants.find((v) => v.id === preview)!}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

function Summary({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "danger" | "live" | "accent" | undefined }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 md:p-5">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          "mt-2 font-display text-3xl leading-none md:text-4xl",
          tone === "danger" && "text-primary",
          tone === "live" && "text-success",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </div>
      <div className="mt-2 truncate text-xs text-muted-foreground md:text-sm">{sub}</div>
    </div>
  );
}

function QrPair() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return (
    <div className="flex gap-3">
      {(["A", "B"] as const).map((v) => (
        <div key={v} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pr-4">
          <div className="rounded-md bg-foreground p-1.5">
            {origin ? (
              <QRCodeSVG value={`${origin}/offer?variant=${v}`} size={64} bgColor="transparent" fgColor="#141211" />
            ) : (
              <div className="h-16 w-16" />
            )}
          </div>
          <div>
            <div className="font-display text-lg leading-none">Variant {v}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Scan to join
              <br />the live test</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function VariantCard({ v, launched, onPreview, onLaunch }: { v: Variant; launched: boolean; onPreview: () => void; onLaunch: () => void }) {
  const [voice, setVoice] = useState<"idle" | "loading" | "playing" | "done">("idle");
  const [transcript, setTranscript] = useState("");
  const [provider, setProvider] = useState<"elevenlabs" | "browser">("browser");
  const stopRef = useRef<() => void>(() => {});
  useEffect(() => () => stopRef.current(), []);

  const genVoice = async () => {
    stopRef.current();
    setVoice("loading");
    const res = await api.voice(v.id, v.copy);
    await sleep(900);
    setTranscript(res.transcript);
    setProvider(res.provider);
    setVoice("playing");
    stopRef.current = playVoice(res.audioUrl, res.transcript, () => setVoice("done"));
  };

  return (
    <div className={cn("flex flex-col rounded-2xl border bg-card p-5 transition", launched ? "border-success/50" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow text-accent">Variant {v.id}</div>
          <h3 className="mt-1 text-3xl leading-none">{v.name}</h3>
        </div>
        <div className="shrink-0 text-right font-display text-3xl text-accent">{v.price}</div>
      </div>
      <p className="mt-3 text-card-foreground/85">{v.items}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        {[
          ["Target", v.target],
          ["Channel", v.channel],
          ["Strategy", v.strategy],
        ].map(([k, val]) => (
          <div key={k} className="rounded-lg bg-surface p-2.5">
            <dt className="eyebrow text-[10px]">{k}</dt>
            <dd className="mt-0.5">{val}</dd>
          </div>
        ))}
      </dl>
      <blockquote className="mt-4 border-l-2 border-accent pl-4 italic text-card-foreground/90">"{v.copy}"</blockquote>

      {voice !== "idle" && (
        <div className="mt-4 rounded-xl bg-background p-3">
          {voice === "loading" ? (
            <div className="text-sm text-muted-foreground">Generating voice ad…</div>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <Waveform active={voice === "playing"} />
                {provider === "elevenlabs" && <span className="eyebrow shrink-0">ElevenLabs voice</span>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Transcript: {transcript}</p>
            </>
          )}
        </div>
      )}

      <div className="mt-auto grid grid-cols-1 gap-2 pt-5 sm:grid-cols-3">
        <button onClick={onPreview} className="rounded-xl border border-border px-3 py-3 font-display text-sm tracking-widest hover:bg-surface">
          Preview campaign
        </button>
        <button
          onClick={genVoice}
          disabled={voice === "loading"}
          className="rounded-xl border border-border px-3 py-3 font-display text-sm tracking-widest hover:bg-surface disabled:opacity-60"
        >
          {voice === "playing" ? "Playing…" : "Generate voice ad"}
        </button>
        <button
          onClick={onLaunch}
          disabled={launched}
          className={cn(
            "rounded-xl px-3 py-3 font-display text-sm tracking-widest transition",
            launched ? "bg-success/15 text-success" : "bg-primary text-primary-foreground hover:brightness-110",
          )}
        >
          {launched ? "Live" : `Launch variant ${v.id}`}
        </button>
      </div>
    </div>
  );
}

function LiveCard({ id, name, r, live, winner }: { id: VariantId; name: string; r: Results[VariantId]; live: boolean; winner: boolean }) {
  const imp = useAnimatedNumber(r.impressions);
  const claims = useAnimatedNumber(r.claims);
  const conv = useAnimatedNumber(r.conversion);
  const rev = useAnimatedNumber(r.revenue);
  const margin = useAnimatedNumber(r.margin);
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 transition-all duration-500",
        winner ? "border-success shadow-glow" : live ? "border-primary/50" : "border-border opacity-70",
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="eyebrow">Variant {id}</div>
          <h3 className="text-2xl">{name}</h3>
        </div>
        <span
          className={cn(
            "rounded-[2px] px-2 py-1 font-display text-xs tracking-widest",
            winner ? "bg-success text-accent-foreground" : live ? "bg-primary/15 text-primary" : "bg-surface text-muted-foreground",
          )}
        >
          {winner ? "Winner" : live ? "Live" : "Not launched"}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-4">
        <Metric label="Impressions" value={Math.round(imp).toString()} />
        <Metric label="Claims" value={Math.round(claims).toString()} />
        <Metric label="Conversion" value={`${Math.round(conv)}%`} big />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
        <Metric label="Est. revenue" value={gbp(rev)} />
        <Metric label="Est. contribution margin" value={gbp(margin)} />
      </div>
    </div>
  );
}

function Metric({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="eyebrow text-[10px]">{label}</div>
      <div className={cn("mt-1 font-display tabular-nums", big ? "text-5xl text-accent" : "text-3xl")}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-3 last:border-0">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-2xl">{value}</span>
    </div>
  );
}

function LearnStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", active ? "border-accent bg-accent/10" : done ? "border-success/40" : "border-border opacity-50")}>
      <div className="flex items-center gap-2 font-display tracking-wider">
        {label}
      </div>
      {active && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface">
          <div className="h-full w-1/2 animate-pulse bg-fire" />
        </div>
      )}
    </div>
  );
}

function HealthCheck() {
  const [state, setState] = useState<"idle" | "checking" | Awaited<ReturnType<typeof api.health>>>("idle");
  const check = async () => {
    setState("checking");
    setState(await api.health());
  };
  if (state === "idle")
    return (
      <button onClick={check} className="opacity-40 hover:opacity-100">
        check connections
      </button>
    );
  if (state === "checking") return <span>Checking…</span>;
  return (
    <button onClick={check} className="text-left">
      Gemma: {state.gemma.ok ? "Connected" : "Unavailable"}
      {state.gemma.model ? ` (${state.gemma.model})` : ""} · ElevenLabs: {state.eleven.ok ? "Connected" : "Unavailable"}
    </button>
  );
}
