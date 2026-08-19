"use server";

import { revalidatePath } from "next/cache";
import { getStore } from "@/server/store";
import { storeOriginal } from "@/server/storage";
import { extractPastedText, extractText } from "@/transcript/extract";
import { normalizeTranscript } from "@/transcript/normalize";
import { segmentTranscript } from "@/transcript/segment";
import { detectMixedMethod } from "@/transcript/detectMixedMethod";
import { enqueueSynthesis, enqueueTheming, enqueueUxEvaluation } from "@/server/jobs/runner";

export interface IngestOutcome {
  transcriptId: string;
  name: string;
  segmentCount: number;
  speakers: string[];
  hasTimestamps: boolean;
  warnings: string[];
  /** Advisory only — the researcher's classification is never overridden. */
  classificationNotice: string | null;
}

async function ingest(
  projectId: string,
  studyId: string,
  input: {
    name: string;
    originalFilename: string | null;
    mimeType: string | null;
    sourceKind: "upload" | "paste";
    rawText: string;
    extractionWarnings: string[];
    originalBytes: Buffer | null;
  },
): Promise<IngestOutcome> {
  const store = getStore();
  const study = await store.getStudy(studyId);
  if (!study) throw new Error("Study not found.");

  const { normalizedText, warnings: normalizationWarnings } = normalizeTranscript(input.rawText);
  if (normalizedText.trim().length === 0) {
    throw new Error(`"${input.name}" produced no readable text and was not added.`);
  }

  const storagePath =
    input.originalBytes && input.originalFilename
      ? await storeOriginal(projectId, studyId, input.originalFilename, input.originalBytes, input.mimeType)
      : null;

  const { segments, speakers, hasTimestamps } = segmentTranscript("pending", normalizedText);

  const transcript = await store.createTranscript(
    {
      studyId,
      projectId,
      name: input.name,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sourceKind: input.sourceKind,
      storagePath,
      // Both are kept: raw is the extraction of record, normalized is what
      // every line reference in the system points into.
      rawText: input.rawText,
      normalizedText,
      extractionWarnings: [...input.extractionWarnings, ...normalizationWarnings],
      participantId: null,
    },
    segments,
  );

  const stored = await store.listSegments(transcript.id);
  const signal = detectMixedMethod(stored, study.researchType);

  return {
    transcriptId: transcript.id,
    name: transcript.name,
    segmentCount: stored.length,
    speakers,
    hasTimestamps,
    warnings: transcript.extractionWarnings,
    classificationNotice: signal.message,
  };
}

export async function addPastedMaterialAction(
  projectId: string,
  studyId: string,
  form: FormData,
): Promise<void> {
  const text = String(form.get("text") ?? "");
  const name = String(form.get("name") ?? "").trim() || "Pasted transcript";
  if (text.trim().length === 0) throw new Error("Paste some transcript text first.");

  const extracted = extractPastedText(text);
  await ingest(projectId, studyId, {
    name,
    originalFilename: null,
    mimeType: "text/plain",
    sourceKind: "paste",
    rawText: extracted.rawText,
    extractionWarnings: extracted.warnings,
    originalBytes: null,
  });

  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function addUploadedMaterialAction(
  projectId: string,
  studyId: string,
  form: FormData,
): Promise<void> {
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new Error("Choose at least one file to upload.");

  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const extracted = await extractText(bytes, file.name, file.type || null);
    await ingest(projectId, studyId, {
      name: file.name,
      originalFilename: file.name,
      mimeType: file.type || null,
      sourceKind: "upload",
      rawText: extracted.rawText,
      extractionWarnings: extracted.warnings,
      originalBytes: bytes,
    });
  }

  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function runSynthesisAction(
  projectId: string,
  studyId: string,
  transcriptId: string,
): Promise<void> {
  const store = getStore();
  const study = await store.getStudy(studyId);
  if (!study?.classificationConfirmedAt) {
    throw new Error("Confirm the study classification before running analysis.");
  }
  const transcript = await store.getTranscript(transcriptId);
  if (!transcript) throw new Error("Transcript not found.");

  await enqueueSynthesis({
    projectId,
    studyId,
    transcriptId,
    transcriptName: transcript.name,
  });
  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function runAllSynthesesAction(projectId: string, studyId: string): Promise<void> {
  const store = getStore();
  const study = await store.getStudy(studyId);
  if (!study?.classificationConfirmedAt) {
    throw new Error("Confirm the study classification before running analysis.");
  }

  const transcripts = await store.listTranscripts(studyId);
  for (const transcript of transcripts) {
    const existing = await store.getSynthesisByTranscript(transcript.id);
    if (existing) continue;
    await enqueueSynthesis({
      projectId,
      studyId,
      transcriptId: transcript.id,
      transcriptName: transcript.name,
    });
  }
  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function runThemingAction(projectId: string, studyId: string): Promise<void> {
  const store = getStore();
  const study = await store.getStudy(studyId);
  if (!study?.classificationConfirmedAt) {
    throw new Error("Confirm the study classification before running analysis.");
  }
  await enqueueTheming({ projectId, studyId, studyName: study.name });
  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}

export async function runUxEvaluationAction(
  projectId: string,
  studyId: string,
  form: FormData,
): Promise<void> {
  const label = String(form.get("label") ?? "").trim() || "Evaluation round";
  await enqueueUxEvaluation({ projectId, studyId, label });
  revalidatePath(`/projects/${projectId}/studies/${studyId}`);
}
