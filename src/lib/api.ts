import {
  buildState,
  computeResults,
  learnLogic,
  runAgentLogic,
  SEED_RAW,
  DEFAULT_CONDITIONS,
  type AppState,
  type Conditions,
  type Learning,
  type Results,
  type Strategy,
  type VariantId,
} from "./agent";
import { localEdit, type EditResult, type PostKit } from "./postkit";

const BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined) ?? "";
const TIMEOUT = 3000;
const LOCAL_KEY = "rm-local-results";

// ---- degraded flag (tiny observable) ----
let degraded = false;
const listeners = new Set<(d: boolean) => void>();
function setDegraded(d: boolean) {
  if (d === degraded) return;
  degraded = d;
  listeners.forEach((l) => l(d));
}
export function subscribeDegraded(fn: (d: boolean) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// ---- cache of last good values ----
const cache: { strategy?: Strategy; results?: Results } = {};

// ---- local fallback store ----
type Raw = Record<VariantId, { impressions: number; claims: number }>;
function readLocal(): Raw {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    if (s) return JSON.parse(s) as Raw;
  } catch {
    /* ignore */
  }
  return { A: { ...SEED_RAW.A }, B: { ...SEED_RAW.B } };
}
function writeLocal(r: Raw) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

async function request<T>(path: string, init?: RequestInit, timeout = TIMEOUT): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as T;
    setDegraded(false);
    return data;
  } finally {
    clearTimeout(t);
  }
}

async function withFallback<T>(real: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await real();
  } catch {
    setDegraded(true);
    return fallback();
  }
}

export const api = {
  getState: () => withFallback<AppState>(() => request("/api/state"), () => buildState(DEFAULT_CONDITIONS)),

  runAgent: (c: Conditions) =>
    withFallback<Strategy>(
      async () => {
        const s = await request<Strategy>("/api/run-agent", { method: "POST", body: JSON.stringify(c) }, 15000);
        if (s.source === "fallback") {
          setDegraded(true);
          return cache.strategy ?? s;
        }
        cache.strategy = s;
        return s;
      },
      () => cache.strategy ?? runAgentLogic(c),
    ),

  impression: (variant: VariantId) =>
    withFallback(
      () => request<{ ok: boolean }>("/api/impression", { method: "POST", body: JSON.stringify({ variant }) }),
      () => {
        const r = readLocal();
        r[variant].impressions += 1;
        writeLocal(r);
        return { ok: true };
      },
    ),

  claim: (variant: VariantId) =>
    withFallback(
      () => request<{ ok: boolean }>("/api/claim", { method: "POST", body: JSON.stringify({ variant }) }),
      () => {
        const r = readLocal();
        r[variant].claims += 1;
        writeLocal(r);
        return { ok: true };
      },
    ),

  results: () =>
    withFallback<Results>(
      async () => {
        const r = await request<Results>("/api/results");
        cache.results = r;
        return r;
      },
      () => computeResults(readLocal()),
    ),

  learn: (results: Results, conditions?: Conditions) =>
    withFallback<Learning>(
      () => request("/api/learn", { method: "POST", body: JSON.stringify({ results, conditions }) }, 15000),
      () => learnLogic(results),
    ),

  /** Returns an ElevenLabs blob URL when available, otherwise null so the browser voice is used. */
  voice: async (variant: VariantId, text: string): Promise<{ audioUrl: string | null; transcript: string; provider: "elevenlabs" | "browser" }> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(BASE + "/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant, text }),
        signal: ctrl.signal,
      });
      if (res.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
        const url = URL.createObjectURL(await res.blob());
        return { audioUrl: url, transcript: text, provider: "elevenlabs" };
      }
    } catch {
      /* fall through */
    } finally {
      clearTimeout(t);
    }
    return { audioUrl: null, transcript: text, provider: "browser" };
  },

  health: async (): Promise<{ gemma: { ok: boolean; model: string | null }; eleven: { ok: boolean } }> => {
    try {
      return await request("/api/health", undefined, 15000);
    } catch {
      return { gemma: { ok: false, model: null }, eleven: { ok: false } };
    }
  },

  /** Edits a post kit. Tries the server, falls back to local rules (no degraded flag; editing is optional). */
  editCampaign: async (variant: VariantId, instruction: string, currentKit: PostKit): Promise<EditResult> => {
    try {
      return await request<EditResult>("/api/edit-campaign", {
        method: "POST",
        body: JSON.stringify({ variant, instruction, currentKit }),
      }, 45000);
    } catch {
      return localEdit(variant, instruction, currentKit);
    }
  },

  reset: async () => {
    writeLocal({ A: { ...SEED_RAW.A }, B: { ...SEED_RAW.B } });
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    await withFallback(() => request("/api/reset", { method: "POST" }), () => ({ ok: true }));
  },
};

/** Plays audio from a TTS service if provided, else uses browser speech synthesis. */
export function playVoice(audioUrl: string | null, text: string, onEnd: () => void) {
  if (audioUrl) {
    const a = new Audio(audioUrl);
    a.onended = onEnd;
    void a.play().catch(onEnd);
    return () => a.pause();
  }
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    setTimeout(onEnd, 3000);
    return () => {};
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB";
  u.rate = 1;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang === "en-GB");
  if (voice) u.voice = voice;
  u.onend = onEnd;
  u.onerror = onEnd;
  window.speechSynthesis.speak(u);
  return () => window.speechSynthesis.cancel();
}
