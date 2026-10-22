export interface ExportOutput {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly missingTemplates: boolean;
  readonly expectedTemplatePath: string | undefined;
}

type MessageKind = 'ERROR' | 'WARNING' | 'SCRIPT ERROR';

interface EngineMessage {
  readonly kind: MessageKind;
  readonly lines: string[];
  location?: string;
}

const messageStartPattern = /^(?<kind>ERROR|WARNING|SCRIPT ERROR): (?<text>.*)$/;
const locationPattern = /^\s+at: (?<where>.*)$/;
const scriptLocationPattern = /\((?<location>res:\/\/[^)]+:\d+)\)\s*$/;
const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');
const missingTemplateLine = 'No export template found at the expected path:';
const missingCustomTemplatePattern = /Custom (?:debug|release) template not found\./;
const noisePatterns = [
  /^Couldn't find the given section "preset\.\d+(?:\.options)?" and key /,
  /^Cannot get keys from nonexistent section "preset\.\d+\.options"/,
  /^Project export for preset ".*" (?:failed|completed with warnings)\.$/,
];

export function readExportOutput(text: string): ExportOutput {
  const messages: EngineMessage[] = [];
  let openMessage: EngineMessage | undefined;
  for (const line of text.replace(ansiEscapePattern, '').split(/\r?\n/)) {
    const start = messageStartPattern.exec(line)?.groups;
    if (start !== undefined) {
      openMessage = { kind: start['kind'] as MessageKind, lines: [start['text'] ?? ''] };
      messages.push(openMessage);
      continue;
    }
    const location = locationPattern.exec(line)?.groups?.['where'];
    if (location !== undefined) {
      if (openMessage !== undefined) {
        openMessage.location = location;
      }
      openMessage = undefined;
    } else if (openMessage !== undefined && line.trim() !== '') {
      openMessage.lines.push(line.trim());
    }
  }
  const meaningful = messages.filter((message) => !noisePatterns.some((pattern) => pattern.test(message.lines[0] ?? '')));
  const errors = meaningful.filter((message) => message.kind !== 'WARNING');
  return {
    errors: errors.map(messageText),
    warnings: meaningful.filter((message) => message.kind === 'WARNING').map(messageText),
    missingTemplates: errors.some((message) => message.lines.includes(missingTemplateLine) || message.lines.some((line) => missingCustomTemplatePattern.test(line))),
    expectedTemplatePath: errors.map(expectedTemplatePathIn).find((path) => path !== undefined),
  };
}

function messageText(message: EngineMessage): string {
  const text = message.lines.join(' ');
  const scriptLocation = message.kind === 'SCRIPT ERROR' ? scriptLocationPattern.exec(message.location ?? '')?.groups?.['location'] : undefined;
  return scriptLocation === undefined ? text : `${text} (${scriptLocation})`;
}

function expectedTemplatePathIn(message: EngineMessage): string | undefined {
  const index = message.lines.indexOf(missingTemplateLine);
  return index === -1 ? undefined : message.lines[index + 1];
}
