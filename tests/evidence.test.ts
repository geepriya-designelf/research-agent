import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEvidence, canonicalize, hasGrounding, locateQuote } from "@/domain/evidence";
import { normalizeTranscript } from "@/transcript/normalize";
import { segmentTranscript } from "@/transcript/segment";
import type { TranscriptSegment } from "@/domain/model";

function segmentsFor(fixtureName: string): TranscriptSegment[] {
  const raw = readFileSync(path.join(process.cwd(), "tests", "fixtures", fixtureName), "utf8");
  const { normalizedText } = normalizeTranscript(raw);
  return segmentTranscript("trs_test", normalizedText).segments;
}

describe("quote verification", () => {
  const segments = segmentsFor("interview.txt");

  it("verifies a quote that really appears in the source and anchors it to lines", () => {
    const evidence = buildEvidence(
      { quote: "I usually just don't bother with it until I have to" },
      "trs_test",
      segments,
    );
    expect(evidence.verification.status).toBe("verified");
    expect(evidence.startLine).toBeGreaterThan(0);
    expect(evidence.segmentIds.length).toBeGreaterThan(0);
  });

  it("rejects a fabricated quote instead of accepting it as evidence", () => {
    const evidence = buildEvidence(
      { quote: "The expense tool is the worst software I have ever used in my life." },
      "trs_test",
      segments,
    );
    expect(evidence.verification.status).toBe("unverified");
    expect(evidence.segmentIds).toHaveLength(0);
    expect(evidence.startLine).toBeNull();
  });

  it("rejects a quote that merges two non-adjacent statements into one", () => {
    const evidence = buildEvidence(
      { quote: "Once I lost a whole batch and I never really trust the submit screen" },
      "trs_test",
      segments,
    );
    expect(evidence.verification.status).toBe("unverified");
  });

  it("keeps the fabricated quote visible rather than silently dropping it", () => {
    const evidence = buildEvidence({ quote: "Something nobody said." }, "trs_test", segments);
    expect(evidence.quote).toBe("Something nobody said.");
    if (evidence.verification.status === "unverified") {
      expect(evidence.verification.reason).toMatch(/could not be located/i);
    }
  });

  it("tolerates smart quotes and whitespace differences, not content differences", () => {
    const tolerant = buildEvidence(
      { quote: "I’m never  really sure if it saved" },
      "trs_test",
      segments,
    );
    expect(tolerant.verification.status).toBe("verified");

    const altered = buildEvidence(
      { quote: "I'm never really sure if it submitted" },
      "trs_test",
      segments,
    );
    expect(altered.verification.status).toBe("unverified");
  });

  it("locates quotes that span consecutive segments", () => {
    const match = locateQuote(
      "Yeah, it's fine. It works. Earlier you mentioned losing a batch",
      segments,
    );
    expect(match).not.toBeNull();
    expect(match!.segmentIds.length).toBeGreaterThan(1);
  });

  it("canonicalizes typographic variants consistently", () => {
    expect(canonicalize("I’m — “fine”…")).toBe(canonicalize("I'm - \"fine\"..."));
  });

  it("treats a claim with no verified evidence as ungrounded", () => {
    const good = buildEvidence({ quote: "Twelve receipts" }, "trs_test", segments);
    const bad = buildEvidence({ quote: "Forty receipts" }, "trs_test", segments);
    expect(hasGrounding([good, bad])).toBe(true);
    expect(hasGrounding([bad])).toBe(false);
    expect(hasGrounding([])).toBe(false);
  });
});
