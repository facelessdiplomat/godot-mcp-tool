export interface ScriptErrorEntry {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const scriptErrorPattern = /^SCRIPT ERROR: (?<message>.+)$/;
const locationPattern = /^\s*at: .*\((?<file>res:\/\/.*):(?<line>\d+)\)\s*$/;

export function readScriptErrors(output: string): ScriptErrorEntry[] {
  const lines = output.split('\n');
  const entries: ScriptErrorEntry[] = [];
  lines.forEach((text, index) => {
    const message = scriptErrorPattern.exec(text.trim())?.groups?.['message'];
    const location = locationPattern.exec(lines[index + 1] ?? '')?.groups;
    const file = location?.['file'];
    const line = location?.['line'];
    if (message !== undefined && file !== undefined && line !== undefined) {
      entries.push({ file, line: Number(line), message });
    }
  });
  return entries;
}
