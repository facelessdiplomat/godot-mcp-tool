import { readFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const resourcePrefix = 'res://';

export function readScriptLines(projectRoot: string, file: string): string[] | undefined {
  if (!file.startsWith(resourcePrefix)) {
    return undefined;
  }
  const path = join(projectRoot, file.slice(resourcePrefix.length));
  const relativePath = relative(projectRoot, path);
  if (isAbsolute(relativePath) || relativePath.split(sep)[0] === '..') {
    return undefined;
  }
  try {
    return readFileSync(path, 'utf8').split(/\r?\n/);
  } catch {
    return undefined;
  }
}
