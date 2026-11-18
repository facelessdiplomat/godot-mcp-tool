import { existsSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { filesInFolder, type ProjectFile, toResourcePath } from '../project/ProjectFiles.js';

export type ScriptFile = ProjectFile;

export interface CodeFiles {
  readonly scripts: readonly ProjectFile[];
  readonly shaders: readonly ProjectFile[];
}

export class ScriptPathError extends Error {
  override readonly name = 'ScriptPathError';
}

const resourcePrefix = 'res://';
const scriptExtension = '.gd';
const shaderExtension = '.gdshader';
const shaderIncludeExtension = '.gdshaderinc';
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
  const file = existingFileAt(projectRoot, input);
  if (statSync(file.absolutePath).isDirectory()) {
    return filesInFolder(projectRoot, file.absolutePath, [scriptExtension]);
  }
  if (!file.absolutePath.endsWith(scriptExtension)) {
    throw new ScriptPathError(`${file.resourcePath} is not a .gd script.`);
  }
  return [file];
}

export function findCodeFiles(projectRoot: string, inputs: readonly string[]): CodeFiles {
  const scripts = new Map<string, ProjectFile>();
  const shaders = new Map<string, ProjectFile>();
  for (const input of inputs) {
    for (const file of codeFilesAt(projectRoot, input)) {
      (file.resourcePath.endsWith(shaderExtension) ? shaders : scripts).set(file.resourcePath, file);
    }
  }
  if (scripts.size + shaders.size > maximumScripts) {
    throw new ScriptPathError(
      `The paths hold ${String(scripts.size + shaders.size)} scripts and shaders; check at most ${String(maximumScripts)} at a time by naming smaller folders.`,
    );
  }
  return { scripts: [...scripts.values()], shaders: [...shaders.values()] };
}

function codeFilesAt(projectRoot: string, input: string): ProjectFile[] {
  const file = existingFileAt(projectRoot, input);
  if (statSync(file.absolutePath).isDirectory()) {
    return filesInFolder(projectRoot, file.absolutePath, [scriptExtension, shaderExtension]);
  }
  if (file.absolutePath.endsWith(shaderIncludeExtension)) {
    throw new ScriptPathError(`${file.resourcePath} is a shader include; check a .gdshader file that includes it.`);
  }
  if (!file.absolutePath.endsWith(scriptExtension) && !file.absolutePath.endsWith(shaderExtension)) {
    throw new ScriptPathError(`${file.resourcePath} is not a .gd script or a .gdshader file.`);
  }
  return [file];
}

function existingFileAt(projectRoot: string, input: string): ProjectFile {
  const absolutePath = input.startsWith(resourcePrefix) ? resolve(projectRoot, input.slice(resourcePrefix.length)) : resolve(projectRoot, input);
  const pathInProject = relative(projectRoot, absolutePath);
  if (pathInProject.startsWith('..') || isAbsolute(pathInProject)) {
    throw new ScriptPathError(`${input} is outside the project at ${projectRoot}.`);
  }
  const resourcePath = toResourcePath(pathInProject);
  if (!existsSync(absolutePath)) {
    throw new ScriptPathError(`${resourcePath} does not exist.`);
  }
  return { resourcePath, absolutePath };
}
