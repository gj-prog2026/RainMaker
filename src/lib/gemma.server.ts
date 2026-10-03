// Server-only Gemma (Gemini API) helper. Never import from client code.

export const DEFAULT_GEMMA_MODEL = "gemma-4-26b-a4b-it";

export type GemmaTask = "run-agent" | "learn" | "edit-campaign" | "health";

/** Single place for model selection. GEMMA_MODEL overrides the default. */
export function getModel(_task: GemmaTask): string {
  return process.env["GEMMA_MODEL"]?.trim() || DEFAULT_GEMMA_MODEL;
}

export function hasGemmaKey() {
  return Boolean(process.env["GEMINI_KEY"]);
}

function stripFences(s: string) {
  const t = s.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : t;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

function reasonFor(status: number) {
  if (status === 400) return "bad request/bad model";
  if (status === 401 || status === 403) return "bad key";
  if (status === 404) return "bad model";
  if (status === 429) return "rate limited";
  return `status ${status}`;
}

async function callOnce(model: string, prompt: string, timeoutMs: number): Promise<string> {
  const key = process.env["GEMINI_KEY"];
  if (!key) throw new Error("missing key");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: "minimal" } },
          }),
          signal: ctrl.signal,
        },
      );
    } catch (e) {
      throw new Error(ctrl.signal.aborted ? "timeout" : `network: ${e instanceof Error ? e.message.slice(0, 40) : "error"}`);
    }
    if (!res.ok) throw new Error(reasonFor(res.status));
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
    if (!text) throw new Error("empty response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks Gemma for JSON. Returns the validated value plus the model used, or null on failure.
 * At most one retry. Never throws; never logs prompts or keys.
 */
export async function gemmaJson<T>(opts: {
  task: GemmaTask;
  system: string;
  user: string;
  validate: (v: unknown) => T | null;
  timeoutMs?: number;
}): Promise<{ value: T; model: string } | null> {
  if (!hasGemmaKey()) {
    console.warn(`[gemma] ${opts.task}: missing GEMINI_KEY`);
    return null;
  }
  const model = getModel(opts.task);
  const prompt = `${opts.system}\n\nRespond with a single JSON object only. No prose, no code fences.\n\n${opts.user}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: string;
    try {
      raw = await callOnce(model, prompt, opts.timeoutMs ?? 6000);
    } catch (e) {
      console.warn(`[gemma] ${opts.task} (${model}) attempt ${attempt + 1} failed: ${e instanceof Error ? e.message.slice(0, 60) : "error"}`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(raw));
    } catch {
      console.warn(`[gemma] ${opts.task} attempt ${attempt + 1} failed: invalid JSON`);
      continue;
    }
    const value = opts.validate(parsed);
    if (value) return { value, model };
    console.warn(`[gemma] ${opts.task} attempt ${attempt + 1} failed: JSON failed validation`);
  }
  return null;
}

/** Minimal connectivity check. */
export async function gemmaPing(): Promise<boolean> {
  if (!hasGemmaKey()) return false;
  try {
    const t = await callOnce(getModel("health"), 'Reply with {"ok":true}', 6000);
    return t.length > 0;
  } catch {
    return false;
  }
}

export const isStr = (v: unknown, max = 2000): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
