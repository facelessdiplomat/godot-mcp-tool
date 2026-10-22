import type { ScriptProblem } from './ScriptProblem.js';

const scriptErrorPattern = /^SCRIPT ERROR: (?:Parse Error: |Compile Error: )?(?<message>.+)$/;
const locationPattern = /^\s*at: .*\((?<file>res:\/\/.*):(?<line>\d+)\)\s*$/;
const undeclaredIdentifierPattern = /^Identifier "(?<name>[^"]+)" not declared in the current scope\.$/;

export function parseCheckOnlyOutput(output: string, autoloadNames: readonly string[]): ScriptProblem[] {
  const lines = output.split('\n');
  const problems: ScriptProblem[] = [];
  const reportedLines = new Set<number>();
  lines.forEach((text, index) => {
    const message = scriptErrorPattern.exec(text.trim())?.groups?.['message'];
    const lineText = locationPattern.exec(lines[index + 1] ?? '')?.groups?.['line'];
    if (message === undefined || lineText === undefined) {
      return;
    }
    const line = Number(lineText);
    if (reportedLines.has(line) || isAutoloadReference(message, autoloadNames)) {
      return;
    }
    reportedLines.add(line);
    problems.push({ line, severity: 'error', message });
  });
  return problems;
}

function isAutoloadReference(message: string, autoloadNames: readonly string[]): boolean {
  const name = undeclaredIdentifierPattern.exec(message)?.groups?.['name'];
  return name !== undefined && autoloadNames.includes(name);
}
