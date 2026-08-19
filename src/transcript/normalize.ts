/**
 * Text normalization.
 *
 * Normalization must be *line-stable*: evidence references are line numbers
 * into the normalized text, so we may collapse horizontal whitespace and fix
 * encodings, but we never reflow or delete lines. Deleting a line would shift
 * every downstream citation.
 */

export interface NormalizationResult {
  normalizedText: string;
  warnings: string[];
}

export function normalizeTranscript(rawText: string): NormalizationResult {
  const warnings: string[] = [];

  let text = rawText.replace(/^﻿/, "").normalize("NFKC");

  if (/\r\n?/.test(text)) text = text.replace(/\r\n?/g, "\n");

  const lines = text.split("\n").map((line) =>
    line
      // Non-breaking and exotic spaces -> plain space.
      .replace(/[    - ]/g, " ")
      // Zero-width characters PDFs love to sprinkle in.
      .replace(/[​-‍﻿]/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]+$/g, ""),
  );

  const normalizedText = lines.join("\n");

  if (normalizedText.trim().length === 0) {
    warnings.push("Normalized transcript is empty.");
  }
  if (lines.length === 1 && normalizedText.length > 2000) {
    warnings.push(
      "Transcript has no line breaks; line-level evidence references will be coarse.",
    );
  }

  return { normalizedText, warnings };
}
