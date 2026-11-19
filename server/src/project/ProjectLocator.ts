import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export type ProjectSource = 'command line' | 'GODOT_PROJECT_PATH' | 'CLAUDE_PROJECT_DIR' | 'working directory' | 'subfolder' | 'project_create';

export type ProjectLookup =
  | { readonly found: true; readonly root: string; readonly source: ProjectSource }
  | { readonly found: false; readonly reason: string };

const projectFileName = 'project.godot';
const godotIgnoreFileName = '.gdignore';
const skippedFolderNames = new Set(['node_modules']);
const deepestSubfolderLevel = 3;

export class ProjectLocator {
  constructor(
    private readonly variables: Readonly<Record<string, string | undefined>>,
    private readonly workingDirectory: string,
    private readonly commandLinePath?: string,
    private readonly createdRoot?: string,
  ) {}

  locate(): ProjectLookup {
    if (this.createdRoot !== undefined && containsProjectFile(this.createdRoot)) {
      return { found: true, root: this.createdRoot, source: 'project_create' };
    }

    if (this.commandLinePath !== undefined) {
      const commandLineRoot = resolve(this.workingDirectory, this.commandLinePath);
      return containsProjectFile(commandLineRoot)
        ? { found: true, root: commandLineRoot, source: 'command line' }
        : { found: false, reason: `${commandLineRoot} has no ${projectFileName}.` };
    }

    const configuredPath = this.variables['GODOT_PROJECT_PATH'];
    if (configuredPath !== undefined && configuredPath !== '') {
      const configuredRoot = resolve(this.workingDirectory, configuredPath);
      return containsProjectFile(configuredRoot)
        ? { found: true, root: configuredRoot, source: 'GODOT_PROJECT_PATH' }
        : { found: false, reason: `GODOT_PROJECT_PATH points to ${configuredRoot}, which has no ${projectFileName}.` };
    }

    const claudeProjectDirectory = this.variables['CLAUDE_PROJECT_DIR'];
    if (claudeProjectDirectory !== undefined && claudeProjectDirectory !== '') {
      const rootFromClaude = findProjectUpwards(resolve(this.workingDirectory, claudeProjectDirectory));
      if (rootFromClaude !== undefined) {
        return { found: true, root: rootFromClaude, source: 'CLAUDE_PROJECT_DIR' };
      }
    }

    const rootFromWorkingDirectory = findProjectUpwards(resolve(this.workingDirectory));
    if (rootFromWorkingDirectory !== undefined) {
      return { found: true, root: rootFromWorkingDirectory, source: 'working directory' };
    }

    const searchedFolder = resolve(this.workingDirectory, claudeProjectDirectory !== undefined && claudeProjectDirectory !== '' ? claudeProjectDirectory : '.');
    const roots = findProjectsBelow(searchedFolder, 1);
    const [onlyRoot] = roots;
    if (onlyRoot !== undefined && roots.length === 1) {
      return { found: true, root: onlyRoot, source: 'subfolder' };
    }
    if (roots.length > 1) {
      return {
        found: false,
        reason: `Several Godot projects lie below ${searchedFolder}: ${roots.map((root) => relative(searchedFolder, root)).join(', ')}. Set GODOT_PROJECT_PATH to the folder of the one to use.`,
      };
    }

    return {
      found: false,
      reason: `No ${projectFileName} was found in ${searchedFolder}, its parent folders or the folders up to three levels below it. Set GODOT_PROJECT_PATH to the Godot project folder.`,
    };
  }
}

function findProjectsBelow(folder: string, level: number): string[] {
  if (level > deepestSubfolderLevel) {
    return [];
  }
  let entries;
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !skippedFolderNames.has(entry.name))
    .map((entry) => join(folder, entry.name))
    .filter((subfolder) => !existsSync(join(subfolder, godotIgnoreFileName)))
    .sort()
    .flatMap((subfolder) => (containsProjectFile(subfolder) ? [subfolder] : findProjectsBelow(subfolder, level + 1)));
}

function containsProjectFile(directory: string): boolean {
  try {
    return statSync(join(directory, projectFileName)).isFile();
  } catch {
    return false;
  }
}

export function findProjectContaining(path: string): string | undefined {
  return findProjectUpwards(dirname(resolve(path)));
}

function findProjectUpwards(startDirectory: string): string | undefined {
  let directory = startDirectory;
  for (;;) {
    if (containsProjectFile(directory)) {
      return directory;
    }
    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      return undefined;
    }
    directory = parentDirectory;
  }
}
