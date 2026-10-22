import type { ScriptProblem } from '../../scripts/ScriptProblem.js';
import type { ScriptReport, ValidationResult } from '../../scripts/ScriptValidator.js';
import { counted } from './counting.js';

const listedNames = 10;

export function formatValidation(result: ValidationResult): string {
  const via = result.method === 'language server' ? "the editor's language server" : 'godot --check-only, which finds errors but not warnings';
  const withProblems = result.reports.filter((report) => report.problems.length > 0);
  const fine = result.reports.filter((report) => report.problems.length === 0).map((report) => report.resourcePath);
  const lines: string[] = [];
  if (withProblems.length === 0) {
    lines.push(`No problems in ${counted(result.reports.length, 'script')}: ${listNames(fine)} (checked with ${via}).`);
  } else {
    const problems = withProblems.flatMap((report) => report.problems);
    lines.push(`${describeCounts(problems)} in ${String(withProblems.length)} of ${counted(result.reports.length, 'script')} (checked with ${via}).`);
  }
  if (result.fallbackReason !== undefined) {
    lines.push(`The language server was not used: ${result.fallbackReason}`);
  }
  if (withProblems.length > 0) {
    lines.push(...withProblems.flatMap(describeReport));
    if (fine.length > 0) {
      lines.push(`No problems: ${listNames(fine)}`);
    }
  }
  return lines.join('\n');
}

function describeReport(report: ScriptReport): string[] {
  return [report.resourcePath, ...report.problems.map((problem) => `  ${describePlace(problem)} ${problem.severity}${problem.code === undefined ? '' : ` (${problem.code})`}: ${problem.message}`)];
}

function describePlace(problem: ScriptProblem): string {
  return problem.column === undefined ? String(problem.line) : `${String(problem.line)}:${String(problem.column)}`;
}

function describeCounts(problems: readonly ScriptProblem[]): string {
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.filter((problem) => problem.severity === 'warning').length;
  const notes = problems.length - errors - warnings;
  const parts = [
    ...(errors > 0 ? [counted(errors, 'error')] : []),
    ...(warnings > 0 ? [counted(warnings, 'warning')] : []),
    ...(notes > 0 ? [counted(notes, 'note')] : []),
  ];
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
}

function listNames(names: readonly string[]): string {
  if (names.length <= listedNames) {
    return names.join(', ');
  }
  return `${names.slice(0, listedNames).join(', ')} and ${String(names.length - listedNames)} more`;
}
