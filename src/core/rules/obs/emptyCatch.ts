import ts from 'typescript';
import type { Rule, RuleDraft } from '../../types.ts';
import { coverage, isTestPath, normalizePath } from '../../scope.ts';
import { safeExcerpt, spanAt, toSafe } from '../../safe.ts';

// rule obs.empty_catch
export const emptyCatchRule: Rule = { id: 'obs.empty_catch', evaluate(snapshot) {
  const predicate = (file: { kind: string; path: string }) => file.kind === 'source' && !isTestPath(file.path);
  const results: RuleDraft[] = []; const parseFailurePaths: string[] = [];
  for (const file of snapshot.files.filter(predicate)) {
    if (file.skipped || file.content === undefined) continue;
    const source = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true,
      /\.tsx$/i.test(file.path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(file.path) ? ts.ScriptKind.JSX :
        /\.[cm]?js$/i.test(file.path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    if ((source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics?.length) { parseFailurePaths.push(normalizePath(file.path)); continue; }
    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node) && node.block.statements.length === 0) {
        const start = node.getStart(source); const end = node.getEnd(); const span = spanAt(file.content!, start, end);
        const rawPath = normalizePath(file.path); const path = toSafe(rawPath);
        results.push({ rule_id: this.id, family: 'obs', subject: `${path}:${span.startLine}:${span.startCol}-${span.endLine}:${span.endCol}`,
          state: 'flagged', concern: true, severity_hint: 'medium',
          evidence: [{ kind: 'file:line', path: rawPath, line: span.startLine, col: span.startCol, endLine: span.endLine,
            endCol: span.endCol, excerpt: safeExcerpt(file.content!, start, end) }],
          message: 'Catch block contains no statements in a non-test source file.',
          blind_spot: 'Comments may document intentional handling; promise .catch callbacks are not checked.' });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const cov = coverage(snapshot, predicate, ['non-test TS/JS source']);
  if (parseFailurePaths.length) cov.skipped.push({ reason: 'parse_failure', count: parseFailurePaths.length });
  if (cov.skipped.length || !results.length) results.push({ rule_id: this.id, family: 'obs', subject: 'root',
    state: cov.skipped.length ? 'unknown' : 'absent_in_scope', concern: cov.skipped.length ? null : false,
    severity_hint: 'info', evidence: [], coverage: cov,
    ...(cov.skipped.length ? { reason: parseFailurePaths.length ? 'parse_failure' : 'coverage_incomplete' } : {}),
    ...(parseFailurePaths.length ? { unknown_paths: parseFailurePaths } : {}),
    message: cov.skipped.length ? 'Non-test source coverage is incomplete.' : 'No empty catch blocks found in examined non-test source.',
    blind_spot: 'Catches that log at debug and continue, and promise .catch callbacks, are not checked.' });
  return results;
} };
