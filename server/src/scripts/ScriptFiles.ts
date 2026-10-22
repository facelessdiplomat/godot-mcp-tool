import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { filesInFolder, type ProjectFile, toResourcePath } from '../project/ProjectFiles.js';

export type ScriptFile = ProjectFile;

export class ScriptPathError extends Error {
  override readonly name = 'ScriptPathError';
}

const resourcePrefix = 'res://';
const scriptExtension = '.gd';
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
    return filesInFolder(projectRoot, absolutePath, [scriptExtension]);
  }
  if (!absolutePath.endsWith(scriptExtension)) {
    throw new ScriptPathError(`${resourcePath} is not a .gd script.`);
  }
  return [{ resourcePath, absolutePath }];
}
