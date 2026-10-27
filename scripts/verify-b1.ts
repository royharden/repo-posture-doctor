import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../baselines/b1-vca13');
function digest(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }
export async function verifyB1(): Promise<void> {
  const pins = JSON.parse(await readFile(join(root, 'pins.json'), 'utf8')) as {
    commit: string; files: { path: string; sha256: string }[]; excerpts: { first: number; last: number; sha256: string }[];
  };
  if (pins.commit !== 'fe0a10016ac8fef46d8fa66e080b03f087fad84d' || pins.files.length !== 4 || pins.excerpts.length !== 4) throw new Error('b1_invalid_pin_manifest');
  for (const file of pins.files) {
    if (!/^supabase\/functions\/_shared\/(?:auditors\/(?:auth|secrets)|mask|fetch-target)\.ts$/.test(file.path)) throw new Error('b1_invalid_pin_path');
    if (digest(await readFile(join(root, file.path))) !== file.sha256) throw new Error('b1_byte_pin_mismatch');
  }
  const selection = await readFile(join(root, 'selection.ts'), 'utf8');
  for (const part of pins.excerpts) {
    const begin = `// BEGIN PINNED EXCERPT ${part.first}-${part.last}\n`;
    const end = `// END PINNED EXCERPT ${part.first}-${part.last}\n`;
    if (selection.split(begin).length !== 2 || selection.split(end).length !== 2) throw new Error('b1_missing_excerpt');
    const excerpt = selection.slice(selection.indexOf(begin) + begin.length, selection.indexOf(end));
    if (digest(excerpt) !== part.sha256) throw new Error('b1_selection_pin_mismatch');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyB1().then(() => console.log('B1 byte and selection pins verified')).catch(() => { console.error('b1_verification_failed'); process.exitCode = 2; });
}
