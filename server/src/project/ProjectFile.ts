import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const projectFileName = 'project.godot';
const sectionPattern = /^\[(?<name>[^\]]+)\]$/;
const keyPattern = /^(?<key>[A-Za-z_][A-Za-z0-9_]*)=/;

export function readAutoloadNames(projectRoot: string): string[] {
  let text: string;
  try {
    text = readFileSync(join(projectRoot, projectFileName), 'utf8');
  } catch {
    return [];
  }
  const names: string[] = [];
  let section = '';
  for (const line of text.split('\n').map((rawLine) => rawLine.trim())) {
    const sectionName = sectionPattern.exec(line)?.groups?.['name'];
    if (sectionName !== undefined) {
      section = sectionName;
      continue;
    }
    const key = keyPattern.exec(line)?.groups?.['key'];
    if (section === 'autoload' && key !== undefined) {
      names.push(key);
    }
  }
  return names;
}
