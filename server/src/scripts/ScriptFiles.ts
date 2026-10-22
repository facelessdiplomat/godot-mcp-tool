import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export interface ScriptFile {
  readonly resourcePath: string;
  readonly absolutePath: string;
}

export class ScriptPathError extends Error {
  override readonly name = 'ScriptPathError';
}

const resourcePrefix = 'res://';
const scriptExtension = '.gd';
const addonsFolder = 'addons';
const maximumScripts = 200;

export function findScripts(projectRoot: string, inputs: readonly string[]): ScriptFile[] {
  const found = new Map<string, ScriptFile>();
  for (const input of inputs) {
    for (const script of scriptsAt(projectRoot, input)) {
      found.set(script.resourcePath, script);
    }
  }
  if (found.size > maximumScripts) {
    throw new ScriptPathError(`The paths hold ${String(found.size)} scripts; check at most ${String(maximumScripts)} at a time by naming smaller folders.`);
  }
  return [...found.values()];
}

function scriptsAt(projectRoot: string, input: string): ScriptFile[] {
  const absolutePath = input.startsWith(resourcePrefix) ? resolve(projectRoot, input.slice(resourcePrefix.length)) : resolve(projectRoot, input);
  const pathInProject = relative(projectRoot, absolutePath);
  if (pathInProject.startsWith('..') || isAbsolute(pathInProject)) {
    throw new ScriptPathError(`${input} is outside the project at ${projectRoot}.`);
  }
  const resourcePath = toResourcePath(pathInProject);
  if (!existsSync(absolutePath)) {
    throw new ScriptPathError(`${resourcePath} does not exist.`);
  }
  if (statSync(absolutePath).isDirectory()) {
    return scriptsInFolder(projectRoot, absolutePath);
  }
  if (!absolutePath.endsWith(scriptExtension)) {
    throw new ScriptPathError(`${resourcePath} is not a .gd script.`);
  }
  return [{ resourcePath, absolutePath }];
}

function scriptsInFolder(projectRoot: string, folder: string): ScriptFile[] {
  const scripts: ScriptFile[] = [];
  const entries = readdirSync(folder, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== addonsFolder) {
        scripts.push(...scriptsInFolder(projectRoot, entryPath));
      }
    } else if (entry.name.endsWith(scriptExtension)) {
      scripts.push({ resourcePath: toResourcePath(relative(projectRoot, entryPath)), absolutePath: entryPath });
    }
  }
  return scripts;
}

function toResourcePath(pathInProject: string): string {
  return `${resourcePrefix}${pathInProject.split(sep).join('/')}`;
}
