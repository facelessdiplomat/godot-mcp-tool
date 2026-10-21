import { statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ProjectSource = 'GODOT_PROJECT_PATH' | 'CLAUDE_PROJECT_DIR' | 'working directory';

export type ProjectLookup =
  | { readonly found: true; readonly root: string; readonly source: ProjectSource }
  | { readonly found: false; readonly reason: string };

const projectFileName = 'project.godot';

export class ProjectLocator {
  constructor(
    private readonly variables: Readonly<Record<string, string | undefined>>,
    private readonly workingDirectory: string,
  ) {}

  locate(): ProjectLookup {
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

    return {
      found: false,
      reason: `No ${projectFileName} was found in ${this.workingDirectory} or its parent folders. Set GODOT_PROJECT_PATH to the Godot project folder.`,
    };
  }
}

function containsProjectFile(directory: string): boolean {
  try {
    return statSync(join(directory, projectFileName)).isFile();
  } catch {
    return false;
  }
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
