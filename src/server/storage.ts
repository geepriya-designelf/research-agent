/**
 * Original source retention.
 *
 * The extracted text is a derived artefact; the file the researcher uploaded is
 * the source of record and is kept untouched. Supabase Storage when configured,
 * a local directory otherwise (matching the store's dev fallback).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "research-material";

export async function storeOriginal(
  projectId: string,
  studyId: string,
  filename: string,
  bytes: Buffer,
  mimeType: string | null,
): Promise<string | null> {
  const objectPath = `${projectId}/${studyId}/${Date.now()}-${sanitize(filename)}`;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && key) {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.storage
      .from(BUCKET)
      .upload(objectPath, bytes, { contentType: mimeType ?? "application/octet-stream" });
    if (error) throw new Error(`Storing the original file failed: ${error.message}`);
    return objectPath;
  }

  const localPath = path.join(process.cwd(), ".data", "originals", objectPath);
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, bytes);
  return objectPath;
}

function sanitize(filename: string): string {
  return filename.replace(/[^\w.\-]+/g, "_").slice(0, 120);
}
