import { readScriptErrors } from './ScriptErrorOutput.js';
import type { ScriptProblem } from './ScriptProblem.js';

const errorKindPattern = /^(?:Parse Error|Compile Error): /;
const undeclaredIdentifierPattern = /^Identifier "(?<name>[^"]+)" not declared in the current scope\.$/;

export function parseCheckOnlyOutput(output: string, autoloadNames: readonly string[]): ScriptProblem[] {
  const problems: ScriptProblem[] = [];
  const reportedLines = new Set<number>();
  for (const scriptError of readScriptErrors(output)) {
    const message = scriptError.message.replace(errorKindPattern, '');
    if (reportedLines.has(scriptError.line) || isAutoloadReference(message, autoloadNames)) {
      continue;
    }
    reportedLines.add(scriptError.line);
    problems.push({ line: scriptError.line, severity: 'error', message });
  }
  return problems;
}

function isAutoloadReference(message: string, autoloadNames: readonly string[]): boolean {
  const name = undeclaredIdentifierPattern.exec(message)?.groups?.['name'];
  return name !== undefined && autoloadNames.includes(name);
}
