import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTranscript } from "@/transcript/normalize";
import { classifySpeaker, segmentTranscript } from "@/transcript/segment";
import { detectMixedMethod } from "@/transcript/detectMixedMethod";
import { detectFormat, UnsupportedFormatError } from "@/transcript/extract";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "tests", "fixtures", name), "utf8");

describe("normalization", () => {
  it("never removes lines, so evidence line numbers stay stable", () => {
    const raw = "Moderator: Hello\r\n\r\nP01:   I  said   this\r\n";
    const { normalizedText } = normalizeTranscript(raw);
    expect(normalizedText.split("\n").length).toBe(raw.split(/\r\n|\n/).length);
    expect(normalizedText).toContain("P01: I said this");
  });

  it("warns when a transcript has no line breaks to anchor evidence to", () => {
    const { warnings } = normalizeTranscript("word ".repeat(600));
    expect(warnings.join(" ")).toMatch(/line-level evidence references will be coarse/);
  });
});

describe("segmentation", () => {
  it("preserves speakers, roles, line spans and timestamps", () => {
    const { normalizedText } = normalizeTranscript(fixture("usability.txt"));
    const { segments, speakers, hasTimestamps } = segmentTranscript("trs_1", normalizedText);

    expect(hasTimestamps).toBe(true);
    expect(speakers).toEqual(expect.arrayContaining(["Moderator", "P07", "Observer"]));

    const participantTurns = segments.filter((s) => s.speakerRole === "participant");
    expect(participantTurns.length).toBeGreaterThan(3);

    for (const segment of segments) {
      expect(segment.startLine).toBeGreaterThan(0);
      expect(segment.endLine).toBeGreaterThanOrEqual(segment.startLine);
      expect(segment.endChar).toBeGreaterThanOrEqual(segment.startChar);
    }
  });

  it("separates observer notes from participant speech", () => {
    const { normalizedText } = normalizeTranscript(fixture("usability.txt"));
    const { segments } = segmentTranscript("trs_1", normalizedText);
    const observer = segments.filter((s) => s.speakerRole === "observer");
    expect(observer.length).toBeGreaterThan(3);
    expect(observer.some((s) => s.text.includes("pauses for 15 seconds"))).toBe(true);
  });

  it("does not invent a speaker when the source has none", () => {
    const { normalizedText } = normalizeTranscript(
      "Some prose about a session.\n\nAnother paragraph entirely.",
    );
    const { segments, hasSpeakerLabels } = segmentTranscript("trs_2", normalizedText);
    expect(hasSpeakerLabels).toBe(false);
    expect(segments.every((s) => s.speaker === null && s.speakerRole === "unknown")).toBe(true);
  });

  it("does not treat mid-sentence colons as speaker labels", () => {
    const { normalizedText } = normalizeTranscript(
      "P01: One thing I noticed about the flow: it never told me it saved anything at all.",
    );
    const { segments } = segmentTranscript("trs_3", normalizedText);
    expect(segments).toHaveLength(1);
    expect(segments[0].speaker).toBe("P01");
    expect(segments[0].text).toContain("it never told me it saved");
  });

  it("classifies common speaker labels without guessing", () => {
    expect(classifySpeaker("Moderator")).toBe("interviewer");
    expect(classifySpeaker("P07")).toBe("participant");
    expect(classifySpeaker("Observer")).toBe("observer");
    expect(classifySpeaker("Dana")).toBe("unknown");
    expect(classifySpeaker(null)).toBe("unknown");
  });
});

describe("mixed-method detection", () => {
  it("flags interview material declared as a usability test without reclassifying it", () => {
    const { normalizedText } = normalizeTranscript(fixture("interview.txt"));
    const { segments } = segmentTranscript("trs_i", normalizedText);
    const signal = detectMixedMethod(segments, "usability_test");

    expect(signal.suggestedType).toBe("user_interview");
    expect(signal.message).toBeTruthy();
    // Advisory only: the signal never mutates the declared classification.
    expect(signal.message).toMatch(/classification will be used as-is/i);
  });

  it("recognises task instructions and behavioural observation", () => {
    const { normalizedText } = normalizeTranscript(fixture("usability.txt"));
    const { segments } = segmentTranscript("trs_u", normalizedText);
    const signal = detectMixedMethod(segments, "usability_test");

    expect(signal.taskHits + signal.observationHits).toBeGreaterThan(2);
    expect(signal.suggestedType).toBe("usability_test");
    expect(signal.message).toBeNull();
  });

  it("flags genuinely mixed material for the researcher to decide", () => {
    const mixed = [
      "Moderator: Tell me about how you currently handle this.",
      "P01: I usually do it at the end of the month.",
      "Moderator: Walk me through how you decide when to start.",
      "P01: When I run out of excuses.",
      "Moderator: Your task is to add a payment card.",
      "Observer: Participant pauses for 20 seconds, clicks the wrong control twice.",
      "Moderator: Can you try to find the default setting?",
    ].join("\n");
    const { normalizedText } = normalizeTranscript(mixed);
    const { segments } = segmentTranscript("trs_m", normalizedText);
    const signal = detectMixedMethod(segments, "user_interview");

    expect(signal.looksMixed).toBe(true);
    expect(signal.message).toMatch(/both interview discussion and usability-test tasks/);
  });
});

describe("format detection", () => {
  it("accepts the supported formats", () => {
    expect(detectFormat("session.txt")).toBe("txt");
    expect(detectFormat("notes.md")).toBe("md");
    expect(detectFormat("P04.docx")).toBe("docx");
    expect(detectFormat("interview.pdf")).toBe("pdf");
    expect(detectFormat("blob", "application/pdf")).toBe("pdf");
  });

  it("refuses formats it cannot parse rather than guessing", () => {
    expect(() => detectFormat("recording.mp4")).toThrow(UnsupportedFormatError);
    expect(() => detectFormat("export.vtt")).toThrow(/Unsupported research material format/);
  });
});
