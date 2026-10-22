export interface ConfigSection {
  readonly name: string;
  readonly values: ReadonlyMap<string, string>;
}

const sectionPattern = /^\[(?<name>[^\]]+)\]$/;
const entryPattern = /^(?<key>[^\s="[;#][^=]*)=(?<value>.*)$/;
const escapedCharacters: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '\r' };

interface OpenSection {
  readonly name: string;
  readonly values: Map<string, string>;
}

interface PendingEntry {
  readonly key: string;
  rawValue: string;
}

export function readConfigSections(text: string): ConfigSection[] {
  const sections: OpenSection[] = [];
  let pending: PendingEntry | undefined;
  for (const line of text.split(/\r?\n/)) {
    const section = sections.at(-1);
    if (pending !== undefined) {
      pending.rawValue += `\n${line}`;
      if (isCompleteValue(pending.rawValue)) {
        section?.values.set(pending.key, decodedValue(pending.rawValue));
        pending = undefined;
      }
      continue;
    }
    const sectionName = sectionPattern.exec(line.trim())?.groups?.['name'];
    if (sectionName !== undefined) {
      sections.push({ name: sectionName, values: new Map() });
      continue;
    }
    const entry = entryPattern.exec(line)?.groups;
    const key = entry?.['key']?.trim();
    const rawValue = entry?.['value'];
    if (key === undefined || rawValue === undefined) {
      continue;
    }
    if (isCompleteValue(rawValue)) {
      section?.values.set(key, decodedValue(rawValue));
    } else {
      pending = { key, rawValue };
    }
  }
  return sections;
}

function isCompleteValue(rawValue: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const character of rawValue) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
    } else if ('([{'.includes(character)) {
      depth += 1;
    } else if (')]}'.includes(character)) {
      depth -= 1;
    }
  }
  return !inString && depth <= 0;
}

function decodedValue(rawValue: string): string {
  const value = rawValue.trim();
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) {
    return value;
  }
  return value.slice(1, -1).replace(/\\(.)/gs, (_escape, character: string) => escapedCharacters[character] ?? character);
}
