import ts from 'typescript';
import type { Rule } from '../../types.ts';
import { summary } from '../tests/support.ts';

const LIBRARY = /^(?:@sentry\/|@datadog\/|@opentelemetry\/|@bugsnag\/|@logtail\/)|^(?:pino|winston|bunyan|loglevel|rollbar|consola)$/;
const LOCAL_NAME = /(?:^|\/)(?:log|logger|logging|telemetry|monitoring)\.(?:ts|js)$/i;
function resolveLocal(importer: string, specifier: string, paths: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const parts = importer.split('/').slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || !segment) continue;
    if (segment === '..') { if (!parts.length) return undefined; parts.pop(); } else parts.push(segment);
  }
  const base = parts.join('/');
  return [base, `${base}.ts`, `${base}.js`, base.replace(/\.js$/, '.ts')].find(path => paths.has(path) && LOCAL_NAME.test(path));
}
// rule obs.no_logging_library
export const noLoggingLibraryRule: Rule = { id: 'obs.no_logging_library', evaluate(snapshot) {
  const predicate = (file: { kind: string; path: string }) => file.kind === 'source' || /(?:^|\/)package\.json$/i.test(file.path);
  const files = snapshot.files.filter(predicate); let reason: string | undefined;
  if (!snapshot.scope.inventory_complete) reason = 'inventory_incomplete';
  if (files.some(file => file.skipped || file.content === undefined)) reason ??= 'coverage_incomplete';
  const paths = new Set(snapshot.files.map(file => file.path)); const importedBy = new Map<string, Set<string>>();
  let knownLibrary = false;
  for (const file of files) {
    if (file.skipped || file.content === undefined) continue;
    if (/(?:^|\/)package\.json$/i.test(file.path)) {
      try {
        const parsed: unknown = JSON.parse(file.content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { reason ??= 'invalid_json'; continue; }
        const manifest = parsed as Record<string, unknown>;
        for (const field of ['dependencies', 'devDependencies']) {
          const section = manifest[field];
          if (section === undefined) continue;
          if (!section || typeof section !== 'object' || Array.isArray(section)) { reason ??= 'invalid_json'; continue; }
          if (Object.keys(section).some(name => LIBRARY.test(name))) knownLibrary = true;
        }
      } catch { reason ??= 'invalid_json'; }
    } else {
      const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
      if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) { reason ??= 'parse_failure'; continue; }
      const add = (specifier: string): void => {
        const resolved = resolveLocal(file.path, specifier, paths); if (!resolved) return;
        const set = importedBy.get(resolved) ?? new Set<string>(); set.add(file.path); importedBy.set(resolved, set);
      };
      const visit = (node: ts.Node): void => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) add(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0].text);
        ts.forEachChild(node, visit);
      }; visit(source);
    }
  }
  const found = knownLibrary || [...importedBy.values()].some(importers => importers.size >= 2);
  return [summary(snapshot, this.id, reason ? null : found,
    reason ? 'Source or manifest coverage is insufficient to determine logging-library presence.' : found ?
      'A listed logging dependency or a recognized local logging module imported by at least two files is present.' :
      'No listed logging library found in the examined manifests and source imports.',
    'Platform logging and deliberate console.error usage are not recognized; a missing library is not missing monitoring.',
    predicate, ['**/package.json', '**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}'], reason)];
} };
