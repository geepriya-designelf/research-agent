/**
 * Stable, human-legible IDs. Every generated artefact (insight, theme, UX
 * issue, evidence span) carries one so provenance survives serialization,
 * export, and re-analysis.
 */

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomSuffix(length = 10): string {
  let out = "";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export type IdPrefix =
  | "prj"
  | "std"
  | "par"
  | "trs"
  | "seg"
  | "rq"
  | "syn"
  | "ins"
  | "evd"
  | "thm"
  | "tev"
  | "fnd"
  | "uxe"
  | "rnd"
  | "tsk"
  | "iss"
  | "ned"
  | "rec"
  | "cmp"
  | "job";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomSuffix()}`;
}

/** Participant display codes: P01, P02, ... Deterministic within a study. */
export function participantCode(indexZeroBased: number): string {
  return `P${String(indexZeroBased + 1).padStart(2, "0")}`;
}
