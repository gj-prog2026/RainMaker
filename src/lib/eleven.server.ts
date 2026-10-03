// Server-only ElevenLabs helper.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL = "eleven_turbo_v2_5";

export function hasElevenKey() {
  return Boolean(process.env["ELEVEN_KEY"]);
}

/** Returns MP3 bytes or null on any failure / 8s timeout. */
export async function elevenTts(text: string): Promise<ArrayBuffer | null> {
  const key = process.env["ELEVEN_KEY"];
  if (!key || !text) return null;
  const voice = process.env["ELEVEN_VOICE_ID"]?.trim() || DEFAULT_VOICE;
  const model = process.env["ELEVEN_MODEL_ID"]?.trim() || DEFAULT_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: model }),
        signal: ctrl.signal,
      },
    );
    if (!res.ok) {
      console.warn(`[eleven] tts status ${res.status}`);
      return null;
    }
    return await res.arrayBuffer();
  } catch {
    console.warn("[eleven] tts failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function elevenPing(): Promise<boolean> {
  const key = process.env["ELEVEN_KEY"];
  if (!key) return false;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/models", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
