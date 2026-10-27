import { MAX_TOTAL_TEXT_CHARS, type FetchedFile } from './supabase/functions/_shared/fetch-target.ts';

// BEGIN PINNED EXCERPT 3-4
const MAX_FILES = 60;
const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
// END PINNED EXCERPT 3-4

// BEGIN PINNED EXCERPT 29-46
const KIND_MAP: Array<[RegExp, string]> = [
  [/supabase\/migrations\/.*\.sql$/i, "migration"],
  [/firestore\.rules$/i, "rules"],
  [/\.env/i, "env"],
  [/package\.json$/i, "package"],
  [/index\.html$/i, "html"],
  [/vite\.config|next\.config|tailwind\.config|nginx\.conf|Dockerfile|vercel\.json|netlify\.toml|wrangler\.toml/i, "config"],
  [/\.(ts|tsx|js|jsx)$/i, "source"],
];

function kindFor(path: string): string | null {
  for (const [re, kind] of KIND_MAP) {
    if (re.test(path)) return kind;
  }
  return null;
}

const PRIORITY_TERMS = /supabase|auth|api|config/i;
// END PINNED EXCERPT 29-46

export interface BlobEntry { type: string; path: string; size?: number }
export function selectCandidates(tree: { tree?: BlobEntry[] }): BlobEntry[] {
// BEGIN PINNED EXCERPT 71-83
  const candidates = (tree.tree || [])
    .filter((e: { type: string; size?: number; path: string }) => e.type === "blob")
    .filter((e: { path: string; size?: number }) => {
      if ((e.size ?? 0) > MAX_FILE_BYTES) return false;
      return kindFor(e.path) !== null;
    })
    .sort((a: { path: string }, b: { path: string }) => {
      const pa = PRIORITY_TERMS.test(a.path) ? 0 : 1;
      const pb = PRIORITY_TERMS.test(b.path) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return a.path.length - b.path.length;
    })
    .slice(0, MAX_FILES);
// END PINNED EXCERPT 71-83
  return candidates;
}

export async function selectFiles(entries: BlobEntry[], readText: (path: string) => Promise<string>): Promise<FetchedFile[]> {
  const candidates = selectCandidates({ tree: entries });
  const files: FetchedFile[] = [];
  let totalText = 0;
  for (const entry of candidates) {
    let text: string | undefined = await readText(entry.path);
    let size = entry.size ?? 0;
    let status = 200;
// BEGIN PINNED EXCERPT 99-115
    text = text?.slice(0, MAX_FILE_BYTES);
    // Same 6 MB total-text budget as URL mode (and the audit function's input limit).
    let error: string | undefined;
    if (text && totalText + text.length > MAX_TOTAL_TEXT_CHARS) {
      text = undefined;
      error = "Size limit exceeded";
    }
    totalText += text?.length ?? 0;
    files.push({
      path: entry.path,
      kind: kindFor(entry.path) || "source",
      status,
      size,
      headers: {},
      text,
      ...(error ? { error } : {}),
    });
// END PINNED EXCERPT 99-115
  }
  return files;
}
