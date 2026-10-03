import { SEED_RAW, type VariantId } from "./agent";

type Raw = Record<VariantId, { impressions: number; claims: number }>;
const clone = (): Raw => ({ A: { ...SEED_RAW.A }, B: { ...SEED_RAW.B } });

// In-memory store (best effort; replace with a database for durable cross-device sync).
const g = globalThis as unknown as { __rmStore?: Raw };
export function getRaw(): Raw {
  if (!g.__rmStore) g.__rmStore = clone();
  return g.__rmStore;
}
export function resetRaw() {
  g.__rmStore = clone();
}
export function parseVariant(v: unknown): VariantId | null {
  return v === "A" || v === "B" ? v : null;
}
