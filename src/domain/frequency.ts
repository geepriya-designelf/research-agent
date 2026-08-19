/**
 * Honest frequency language.
 *
 * Qualitative counts are not statistics. "3 of 5 participants" is a fact;
 * "most users" is a claim this data cannot support. This module is the single
 * place that renders counts into words, so no prompt or component can drift.
 */

import type { PatternStrength } from "./model";

export function frequencyPhrase(count: number, total: number): string {
  if (total <= 0) return `${count} participant${count === 1 ? "" : "s"}`;
  return `${count} of ${total} participant${total === 1 ? "" : "s"}`;
}

const BANNED_QUANTIFIERS = [
  "most users",
  "most participants",
  "the majority of users",
  "the majority of participants",
  "users generally",
  "participants generally",
  "everyone",
  "all users",
  "nobody",
  "users always",
  "users never",
  "statistically significant",
  "significantly more",
  "proves that",
  "confirms that",
];

/**
 * Flags generalizing language that overstates qualitative evidence. Returns the
 * offending phrases so the UI can surface them rather than silently rewriting
 * the analyst's words.
 */
export function detectOvergeneralization(text: string): string[] {
  const haystack = text.toLowerCase();
  return BANNED_QUANTIFIERS.filter((phrase) => haystack.includes(phrase));
}

/**
 * Pattern strength from coverage plus evidence quality. Deliberately not a
 * pure function of count: two participants with rich, converging evidence is a
 * stronger signal than four passing mentions, and neither is a majority claim.
 */
export function derivePatternStrength(input: {
  supportingParticipants: number;
  totalParticipants: number;
  verifiedEvidenceCount: number;
  counterEvidenceCount: number;
}): PatternStrength {
  const { supportingParticipants, totalParticipants, verifiedEvidenceCount, counterEvidenceCount } =
    input;

  if (supportingParticipants <= 1 || verifiedEvidenceCount === 0) return "weak";

  const coverage = totalParticipants > 0 ? supportingParticipants / totalParticipants : 0;
  const evidenceDensity = verifiedEvidenceCount / Math.max(supportingParticipants, 1);
  const contested = counterEvidenceCount > 0;

  if (supportingParticipants === 2) {
    return evidenceDensity >= 2 && !contested ? "emerging" : "weak";
  }

  if (coverage >= 0.6 && evidenceDensity >= 1.5) {
    return contested && counterEvidenceCount >= supportingParticipants ? "moderate" : "strong";
  }

  if (coverage >= 0.4 || evidenceDensity >= 1.5) return "moderate";

  return "emerging";
}

/**
 * Whether a candidate pattern has earned the name "theme". A single
 * participant is an outlier worth preserving — it is not a theme.
 */
export function qualifiesAsTheme(input: {
  supportingParticipants: number;
  verifiedEvidenceCount: number;
}): boolean {
  return input.supportingParticipants >= 2 && input.verifiedEvidenceCount >= 2;
}
