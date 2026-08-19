import path from "node:path";
import { FileStore } from "./fileStore";
import { SupabaseStore } from "./supabaseStore";
import type { ResearchStore } from "./types";

let store: ResearchStore | null = null;

/**
 * Supabase when configured, file-backed otherwise. The application never
 * branches on this — it only ever sees `ResearchStore`.
 */
export function getStore(): ResearchStore {
  if (store) return store;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  store =
    url && serviceKey
      ? new SupabaseStore(url, serviceKey)
      : new FileStore(path.join(process.cwd(), ".data", "research-insights.json"));

  return store;
}

export function storeBackend(): "supabase" | "file" {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return url && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "file";
}

export type { ResearchStore } from "./types";
