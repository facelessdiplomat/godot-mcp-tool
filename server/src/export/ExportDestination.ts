import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ExportError } from './ExportError.js';

const resourcePrefix = 'res://';
const ignoreFileName = '.gdignore';
const parentFolder = '..';
const projectFileExtensions = new Set(['gd', 'gdshader', 'gdshaderinc', 'tscn', 'scn', 'tres', 'res', 'import', 'uid', 'gdextension', 'cs']);

export class ExportDestination {
  private constructor(
    private readonly projectRoot: string,
    readonly relativePath: string,
    readonly ignoredFolder: string | undefined,
  ) {}

  static resolve(projectRoot: string, requestedPath: string): ExportDestination {
    const pathInProject = requestedPath.startsWith(resourcePrefix) ? requestedPath.slice(resourcePrefix.length) : requestedPath;
    const absolutePath = resolve(projectRoot, pathInProject);
    const segments = relative(projectRoot, absolutePath).split(sep);
    const exampleName = basename(absolutePath);
    if (!isWithin(projectRoot, absolutePath) || !isWithin(realpathSync(projectRoot), realpathSync(deepestExistingPath(absolutePath)))) {
      throw new ExportError(
        `${requestedPath} is outside the project. export_project writes only inside the project folder: pass output inside it, such as "build/${exampleName}", or export to other places from Project → Export in the editor.`,
      );
    }
    const folderSegments = segments.slice(0, -1);
    if (folderSegments.length === 0) {
      throw new ExportError(`Export into a folder of its own inside the project, such as "build/${exampleName}", not into the project folder itself.`);
    }
    const relativePath = segments.join('/');
    const hiddenFolder = folderSegments.find((segment) => segment.startsWith('.'));
    if (hiddenFolder !== undefined) {
      throw new ExportError(`${relativePath} is in the hidden folder ${hiddenFolder}; export into a visible folder, such as "build/${exampleName}".`);
    }
    for (let depth = 1; depth <= folderSegments.length; depth += 1) {
      const folderPath = join(projectRoot, ...folderSegments.slice(0, depth));
      if (!existsSync(folderPath)) {
        return new ExportDestination(projectRoot, relativePath, folderSegments.slice(0, depth).join('/'));
      }
      if (!statSync(folderPath).isDirectory()) {
        throw new ExportError(`${folderSegments.slice(0, depth).join('/')} is a file, so ${relativePath} cannot be written; export into a folder, such as "build/${exampleName}".`);
      }
      if (existsSync(join(folderPath, ignoreFileName))) {
        return new ExportDestination(projectRoot, relativePath, undefined);
      }
    }
    const outputFolder = folderSegments.join('/');
    const projectFile = firstProjectFile(projectRoot, join(projectRoot, ...folderSegments));
    if (projectFile !== undefined) {
      throw new ExportError(
        `${outputFolder}/ holds project files, such as ${projectFile}. Export into a folder of its own, such as "build/${exampleName}", which gets a .gdignore file so the editor does not import the exported files.`,
      );
    }
    return new ExportDestination(projectRoot, relativePath, outputFolder);
  }

  get absolutePath(): string {
    return join(this.projectRoot, ...this.relativePath.split('/'));
  }

  get folder(): string {
    return dirname(this.absolutePath);
  }

  prepare(): void {
    mkdirSync(this.folder, { recursive: true });
    if (this.ignoredFolder !== undefined) {
      writeFileSync(join(this.projectRoot, ...this.ignoredFolder.split('/'), ignoreFileName), '');
    }
  }
}

function isWithin(folder: string, path: string): boolean {
  const relativePath = relative(folder, path);
  return !isAbsolute(relativePath) && relativePath.split(sep)[0] !== parentFolder;
}

function deepestExistingPath(path: string): string {
  let existingPath = path;
  while (!pathEntryExists(existingPath)) {
    existingPath = dirname(existingPath);
  }
  return existingPath;
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function firstProjectFile(projectRoot: string, folderPath: string): string | undefined {
  const entries = readdirSync(folderPath, { withFileTypes: true }).sort((first, second) => first.name.localeCompare(second.name));
  if (entries.some((entry) => entry.name === ignoreFileName)) {
    return undefined;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const entryPath = join(folderPath, entry.name);
    if (entry.isDirectory()) {
      const nestedFile = firstProjectFile(projectRoot, entryPath);
      if (nestedFile !== undefined) {
        return nestedFile;
      }
    } else if (projectFileExtensions.has(entry.name.split('.').pop() ?? '')) {
      return relative(projectRoot, entryPath).split(sep).join('/');
    }
  }
  return undefined;
}
