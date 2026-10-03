// Browser-only story video ad renderer: canvas + Web Audio + MediaRecorder. No external services.
import { api } from "./api";
import { THEMES, type MusicMood, type PostKit } from "./postkit";
import type { VariantId } from "./agent";

export const VIDEO_W = 1080;
export const VIDEO_H = 1920;
export const VIDEO_SECONDS = 15;

// ---------- narration (cached per script) ----------
const narrationCache = new Map<string, Blob>();

/** ElevenLabs narration for a script, cached so unchanged scripts don't spend credits. Null if unavailable. */
export async function getNarration(variant: VariantId, script: string): Promise<Blob | null> {
  const hit = narrationCache.get(script);
  if (hit) return hit;
  const res = await api.voice(variant, script);
  if (!res.audioUrl) return null;
  try {
    const blob = await (await fetch(res.audioUrl)).blob();
    URL.revokeObjectURL(res.audioUrl);
    narrationCache.set(script, blob);
    return blob;
  } catch {
    return null;
  }
}
export const hasCachedNarration = (script: string) => narrationCache.has(script);

// ---------- recording support ----------
export function pickMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  const c = HTMLCanvasElement.prototype as { captureStream?: unknown };
  if (typeof c.captureStream !== "function") return null;
  const opts: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm;codecs=vp8,opus", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [mime, ext] of opts) if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  return null;
}

// ---------- music ----------
const TEMPO: Record<MusicMood, number> = { upbeat: 118, chill: 84, bold: 128 };
const BASS = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1

async function synthBeat(mood: MusicMood): Promise<AudioBuffer> {
  const sr = 44100;
  const bpm = TEMPO[mood];
  const beat = 60 / bpm;
  const bars = 4;
  const len = beat * 4 * bars; // one seamless loop
  const oc = new OfflineAudioContext(2, Math.ceil(sr * len), sr);
  const master = oc.createGain();
  master.gain.value = mood === "chill" ? 0.55 : 0.7;
  master.connect(oc.destination);

  const noise = oc.createBuffer(1, sr * 0.2, sr);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const kick = (t: number, v = 1) => {
    const o = oc.createOscillator();
    const g = oc.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.32);
  };
  const hat = (t: number, v = 0.18) => {
    const s = oc.createBufferSource();
    s.buffer = noise;
    const f = oc.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = oc.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + 0.06);
  };
  const bass = (t: number, freq: number, d: number) => {
    const o = oc.createOscillator();
    o.type = mood === "chill" ? "triangle" : "sawtooth";
    o.frequency.value = freq;
    const f = oc.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = mood === "bold" ? 600 : 380;
    const g = oc.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.32, t + 0.02);
    g.gain.setValueAtTime(0.32, t + d * 0.7);
    g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + d + 0.01);
  };

  for (let b = 0; b < bars; b++) {
    const root = BASS[b % BASS.length]!;
    for (let q = 0; q < 4; q++) {
      const t = (b * 4 + q) * beat;
      if (mood === "chill") {
        if (q === 0 || q === 2) kick(t, 0.8);
        hat(t + beat / 2, 0.1);
        if (q === 0) bass(t, root, beat * 2);
        if (q === 2) bass(t, root * 1.5, beat * 2);
      } else {
        kick(t, mood === "bold" ? 1 : 0.9);
        hat(t + beat / 2);
        if (mood === "bold") hat(t + beat / 4, 0.08);
        bass(t, root, beat * 0.9);
        bass(t + beat / 2, mood === "bold" ? root : root * 2, beat * 0.45);
      }
    }
  }
  return oc.startRendering();
}

async function loadMusic(ac: AudioContext, mood: MusicMood): Promise<AudioBuffer> {
  try {
    const res = await fetch(`/audio/${mood}.mp3`);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("audio")) {
      return await ac.decodeAudioData(await res.arrayBuffer());
    }
  } catch {
    /* fall through to synth */
  }
  return synthBeat(mood);
}

// ---------- drawing ----------
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const BODY = "Inter, sans-serif";
const PAD = 88;
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

interface Timing { words: string[]; starts: number[]; ends: number[] }
function captionTiming(script: string, start: number, dur: number): Timing {
  const words = script.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.replace(/[^\w£]/g, "").length + 2 + (/[.,!?:]$/.test(w) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const starts: number[] = [];
  const ends: number[] = [];
  let acc = 0;
  for (const w of weights) {
    starts.push(start + (acc / total) * dur);
    acc += w;
    ends.push(start + (acc / total) * dur);
  }
  return { words, starts, ends };
}

function splitItems(items: string): string[] {
  const parts = items.split(/,\s*|\s+\+\s+|\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts.slice(0, 5) : [items];
}

export function drawFrame(ctx: CanvasRenderingContext2D, kit: PostKit, t: number, cap: Timing) {
  const th = THEMES[kit.posterTheme] ?? THEMES.charcoal;
  const W = VIDEO_W;
  const inner = W - PAD * 2;
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, W, VIDEO_H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // top rule grows in
  ctx.fillStyle = th.rule;
  ctx.fillRect(PAD, PAD, inner * ease(t / 0.6), 18);

  ctx.fillStyle = th.muted;
  ctx.font = `700 44px ${DISPLAY}`;
  ctx.globalAlpha = ease(t / 0.6);
  ctx.fillText("BRADFORD FRIED CHICKEN", PAD, PAD + 18 + 40 + 40);
  ctx.globalAlpha = 1;

  // 0-2s headline
  ctx.font = `700 170px ${DISPLAY}`;
  const hLines = wrap(ctx, kit.headline.toUpperCase(), inner);
  let y = 420;
  hLines.forEach((ln, i) => {
    const p = ease((t - 0.2 - i * 0.25) / 0.7);
    ctx.globalAlpha = p;
    ctx.fillStyle = th.text;
    ctx.fillText(ln, PAD - (1 - p) * 120, y);
    y += 150;
  });
  ctx.globalAlpha = 1;

  // 2-9s items, one by one
  const items = splitItems(kit.items);
  const slot = 7 / items.length;
  y += 40;
  ctx.font = `600 54px ${BODY}`;
  items.forEach((it, i) => {
    const p = ease((t - 2 - i * slot) / 0.45);
    if (p <= 0) {
      y += wrap(ctx, it, inner - 60).length * 68 + 14;
      return;
    }
    ctx.globalAlpha = p;
    ctx.fillStyle = th.accent;
    ctx.fillRect(PAD + (1 - p) * 200, y - 34, 24, 8);
    ctx.fillStyle = th.text;
    for (const ln of wrap(ctx, it, inner - 60)) {
      ctx.fillText(ln, PAD + 50 + (1 - p) * 200, y);
      y += 68;
    }
    y += 14;
  });
  ctx.globalAlpha = 1;

  // 9-13s price bounce
  const pt = (t - 9) / 0.6;
  if (pt > 0) {
    const s = pt >= 1 ? 1 : clamp01(pt) < 0.7 ? ease(pt / 0.7) * 1.12 : 1.12 - ((pt - 0.7) / 0.3) * 0.12;
    ctx.save();
    ctx.font = `700 230px ${DISPLAY}`;
    const py = Math.max(y + 200, 1330);
    ctx.translate(PAD, py);
    ctx.scale(s, s);
    ctx.fillStyle = th.accent;
    const priceLines = wrap(ctx, kit.price.toUpperCase(), inner / Math.max(s, 0.01));
    priceLines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 0, i * 200));
    ctx.restore();
  }

  // 13-15s end card
  const et = ease((t - 13) / 0.5);
  if (et > 0) {
    ctx.globalAlpha = et;
    ctx.fillStyle = th.rule;
    ctx.fillRect(PAD, 1520, inner, 6);
    ctx.fillStyle = th.text;
    ctx.font = `700 70px ${DISPLAY}`;
    ctx.fillText("TONIGHT ONLY IN BRADFORD", PAD, 1610);
    ctx.fillStyle = th.muted;
    ctx.font = `700 36px ${DISPLAY}`;
    ctx.fillText("BRADFORD FRIED CHICKEN", PAD, 1660);
    ctx.globalAlpha = 1;
  }

  // burned-in captions, word by word
  const idx = cap.starts.findIndex((s, i) => t >= s && t < cap.ends[i]!);
  if (idx >= 0) {
    const group = Math.floor(idx / 6) * 6;
    const words = cap.words.slice(group, group + 6);
    ctx.font = `600 52px ${BODY}`;
    const lines: string[][] = [[]];
    let lw = 0;
    for (const w of words) {
      const ww = ctx.measureText(w + " ").width;
      if (lw + ww > inner && lines[lines.length - 1]!.length) {
        lines.push([]);
        lw = 0;
      }
      lines[lines.length - 1]!.push(w);
      lw += ww;
    }
    let cy = 1760;
    lines.forEach((ln) => {
      const total = ctx.measureText(ln.join(" ")).width;
      let cx = (W - total) / 2;
      ln.forEach((w) => {
        const gi = cap.words.indexOf(w, group);
        ctx.fillStyle = gi === idx ? th.accent : th.text;
        ctx.fillText(w, cx, cy);
        cx += ctx.measureText(w + " ").width;
      });
      cy += 64;
    });
  }
}

// ---------- record ----------
export async function recordStoryVideo(opts: {
  kit: PostKit;
  narration: Blob | null;
  onProgress: (p: number) => void;
}): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const picked = pickMime();
  if (!picked) throw new Error("unsupported");
  await Promise.all([
    document.fonts.load(`700 100px 'Barlow Condensed'`),
    document.fonts.load(`600 50px Inter`),
  ]).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext("2d")!;

  const ac = new AudioContext();
  await ac.resume();
  const dest = ac.createMediaStreamDestination();
  let narr: AudioBuffer | null = null;
  if (opts.narration) {
    try {
      narr = await ac.decodeAudioData(await opts.narration.arrayBuffer());
    } catch {
      narr = null;
    }
  }
  const musicBuf = await loadMusic(ac, opts.kit.musicMood);

  const nStart = 0.4;
  const nDur = narr ? Math.min(narr.duration, VIDEO_SECONDS - nStart - 0.6) : 12.5;
  const cap = captionTiming(opts.kit.voiceScript, nStart, nDur);
  drawFrame(ctx, opts.kit, 0, cap);

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res) => (rec.onstop = () => res()));

  const t0 = ac.currentTime + 0.15;
  const full = 0.85;
  const duck = 0.22;
  const mGain = ac.createGain();
  mGain.gain.setValueAtTime(full, t0);
  const fadeAt = t0 + VIDEO_SECONDS - 1.2;
  if (narr) {
    const ns = t0 + nStart;
    const ne = Math.min(ns + nDur, fadeAt - 0.3);
    mGain.gain.setValueAtTime(full, ns - 0.25);
    mGain.gain.linearRampToValueAtTime(duck, ns);
    mGain.gain.setValueAtTime(duck, ne);
    mGain.gain.linearRampToValueAtTime(full, ne + 0.3);
  }
  mGain.gain.setValueAtTime(full, fadeAt);
  mGain.gain.linearRampToValueAtTime(0, t0 + VIDEO_SECONDS);
  const m = ac.createBufferSource();
  m.buffer = musicBuf;
  m.loop = true;
  m.connect(mGain).connect(dest);
  m.start(t0);
  m.stop(t0 + VIDEO_SECONDS + 0.1);
  if (narr) {
    const n = ac.createBufferSource();
    n.buffer = narr;
    n.connect(dest);
    n.start(t0 + nStart);
  }

  rec.start(250);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = ac.currentTime - t0;
      drawFrame(ctx, opts.kit, Math.max(0, t), cap);
      opts.onProgress(clamp01(t / VIDEO_SECONDS));
      if (t >= VIDEO_SECONDS) return resolve();
      setTimeout(tick, 1000 / 30);
    };
    tick();
  });
  rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  void ac.close();
  return { blob: new Blob(chunks, { type: picked.mime.split(";")[0] ?? picked.mime }), ext: picked.ext };
}
