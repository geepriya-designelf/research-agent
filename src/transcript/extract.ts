/**
 * File -> text extraction.
 *
 * Extractors are registered by extension/MIME so that adding .vtt, .srt, .csv
 * later is a matter of adding an entry here, not touching the pipeline.
 * The original bytes are always stored separately (see the storage layer);
 * this module only produces `rawText`.
 */

export interface ExtractionResult {
  rawText: string;
  warnings: string[];
  /** Detected format, for display and for choosing a segmenter. */
  format: SupportedFormat;
}

export const SUPPORTED_FORMATS = ["txt", "md", "docx", "pdf", "paste"] as const;
export type SupportedFormat = (typeof SUPPORTED_FORMATS)[number];

/** Formats the architecture anticipates but the MVP does not yet parse. */
export const PLANNED_FORMATS = ["csv", "vtt", "srt", "json"] as const;

export class UnsupportedFormatError extends Error {
  constructor(public readonly extension: string) {
    super(
      `Unsupported research material format ".${extension}". Supported today: ${SUPPORTED_FORMATS.join(", ")}.`,
    );
    this.name = "UnsupportedFormatError";
  }
}

export function detectFormat(filename: string, mimeType?: string | null): SupportedFormat {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (ext === "txt" || ext === "text") return "txt";
  if (ext === "md" || ext === "markdown") return "md";
  if (ext === "docx") return "docx";
  if (ext === "pdf") return "pdf";

  if (mimeType) {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.includes("wordprocessingml")) return "docx";
    if (mimeType.startsWith("text/")) return "txt";
  }
  throw new UnsupportedFormatError(ext || "unknown");
}

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string | null,
): Promise<ExtractionResult> {
  const format = detectFormat(filename, mimeType);
  const warnings: string[] = [];

  switch (format) {
    case "txt":
    case "md":
      return { rawText: buffer.toString("utf8"), warnings, format };

    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      for (const message of result.messages) {
        warnings.push(`docx: ${message.message}`);
      }
      if (!result.value.trim()) {
        warnings.push("docx produced no text — the file may contain only images.");
      }
      return { rawText: result.value, warnings, format };
    }

    case "pdf": {
      const text = await extractPdf(buffer, warnings);
      return { rawText: text, warnings, format };
    }

    default:
      throw new UnsupportedFormatError(format);
  }
}

async function extractPdf(buffer: Buffer, warnings: string[]): Promise<string> {
  const mod: unknown = await import("pdf-parse");
  const candidate = mod as {
    default?: unknown;
    pdf?: unknown;
    PDFParse?: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> };
  };

  // pdf-parse v2 exposes a class; v1 exposes a callable default. Support both
  // so a dependency bump does not silently break ingestion.
  if (typeof candidate.PDFParse === "function") {
    const parser = new candidate.PDFParse({ data: buffer });
    const result = await parser.getText();
    if (!result.text.trim()) {
      warnings.push(
        "PDF produced no extractable text — it is likely a scan. OCR is not performed; upload a text transcript instead.",
      );
    }
    return result.text;
  }

  const callable =
    typeof candidate.default === "function"
      ? (candidate.default as (b: Buffer) => Promise<{ text: string }>)
      : typeof mod === "function"
        ? (mod as (b: Buffer) => Promise<{ text: string }>)
        : null;

  if (!callable) {
    throw new Error("pdf-parse exposed an unrecognised interface; cannot extract PDF text.");
  }
  const result = await callable(buffer);
  if (!result.text.trim()) {
    warnings.push(
      "PDF produced no extractable text — it is likely a scan. OCR is not performed; upload a text transcript instead.",
    );
  }
  return result.text;
}

export function extractPastedText(text: string): ExtractionResult {
  return { rawText: text, warnings: [], format: "paste" };
}
