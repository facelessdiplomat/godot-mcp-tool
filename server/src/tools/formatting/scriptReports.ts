import type { ScriptProblem } from '../../scripts/ScriptProblem.js';
import type { ScriptReport, ValidationResult } from '../../scripts/ScriptValidator.js';
import { counted } from './counting.js';

const listedNames = 10;

export function formatValidation(result: ValidationResult): string {
  const shaderReports = result.shaderReports ?? [];
  const lines: string[] = [];
  if (result.reports.length > 0 || shaderReports.length === 0) {
    const via = result.method === 'language server' ? "the editor's language server" : 'godot --check-only, which finds errors but not warnings';
    const fallback = result.fallbackReason === undefined ? [] : [`The language server was not used: ${result.fallbackReason}`];
    lines.push(...describeChecked(result.reports, 'script', `checked with ${via}`, `checked with ${via}`, fallback));
  }
  if (shaderReports.length > 0) {
    const compiler = "compiled by Godot's shader compiler";
    lines.push(...describeChecked(shaderReports, 'shader', compiler, `${compiler}, which stops at the first error of each shader`, []));
  }
  return lines.join('\n');
}

function describeChecked(reports: readonly ScriptReport[], noun: string, how: string, howWithProblems: string, notes: readonly string[]): string[] {
  const withProblems = reports.filter((report) => report.problems.length > 0);
  const fine = reports.filter((report) => report.problems.length === 0).map((report) => report.resourcePath);
  if (withProblems.length === 0) {
    return [`No problems in ${counted(reports.length, noun)}: ${listNames(fine)} (${how}).`, ...notes];
  }
  const problems = withProblems.flatMap((report) => report.problems);
  return [
    `${describeCounts(problems)} in ${String(withProblems.length)} of ${counted(reports.length, noun)} (${howWithProblems}).`,
    ...notes,
    ...withProblems.flatMap(describeReport),
    ...(fine.length > 0 ? [`No problems: ${listNames(fine)}`] : []),
  ];
}

function describeReport(report: ScriptReport): string[] {
  return [report.resourcePath, ...report.problems.map((problem) => `  ${describePlace(problem)} ${problem.severity}${problem.code === undefined ? '' : ` (${problem.code})`}: ${problem.message}`)];
}

function describePlace(problem: ScriptProblem): string {
  const file = problem.file === undefined ? '' : `${problem.file}:`;
  return problem.column === undefined ? `${file}${String(problem.line)}` : `${file}${String(problem.line)}:${String(problem.column)}`;
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
