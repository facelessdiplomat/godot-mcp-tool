import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface ProjectFile {
  readonly resourcePath: string;
  readonly absolutePath: string;
}

const resourcePrefix = 'res://';
const addonsFolder = 'addons';
const sceneExtensions = ['.tscn', '.scn'];

export function filesInFolder(projectRoot: string, folder: string, extensions: readonly string[]): ProjectFile[] {
  const files: ProjectFile[] = [];
  const entries = readdirSync(folder, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== addonsFolder) {
        files.push(...filesInFolder(projectRoot, entryPath, extensions));
      }
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push({ resourcePath: toResourcePath(relative(projectRoot, entryPath)), absolutePath: entryPath });
    }
  }
  return files;
}

export function listScenes(projectRoot: string): string[] {
  return filesInFolder(projectRoot, projectRoot, sceneExtensions).map((file) => file.resourcePath);
}

export function toResourcePath(pathInProject: string): string {
  return `${resourcePrefix}${pathInProject.split(sep).join('/')}`;
}

export function fileChangedAfter(projectRoot: string, resourcePath: string, timeMs: number): boolean {
  try {
    return statSync(join(projectRoot, resourcePath.slice(resourcePrefix.length))).mtimeMs > timeMs;
  } catch {
    return true;
  }
}
