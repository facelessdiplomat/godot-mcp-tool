import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { CommandReport } from '../cli/CommandReport.js';
import { editorconfigText, gitattributesText, gitignoreText, mainScenePath, mainSceneText, projectFileText, type Renderer, titleFromFolderName } from './ProjectTemplate.js';

export interface ProjectRequest {
  readonly path?: string | undefined;
  readonly name?: string | undefined;
  readonly renderer?: Renderer | undefined;
  readonly windowSize?: readonly [number, number] | undefined;
}

export interface CreatedProject {
  readonly root: string;
  readonly name: string;
  readonly renderer: Renderer;
  readonly windowSize: readonly [number, number];
  readonly mainScene: string;
  readonly addon: string;
}

export interface ProjectCreatorDependencies {
  readonly workingDirectory: string;
  readonly installAddon: (projectRoot: string) => CommandReport;
  readonly readVersionBranch: () => Promise<string | undefined>;
}

export class ProjectCreationError extends Error {
  override readonly name = 'ProjectCreationError';
}

const defaultWindowSize: readonly [number, number] = [1152, 648];
const projectFileName = 'project.godot';
const notesExtension = '.md';

export class ProjectCreator {
  constructor(private readonly dependencies: ProjectCreatorDependencies) {}

  async create(request: ProjectRequest): Promise<CreatedProject> {
    const root = resolve(this.dependencies.workingDirectory, request.path ?? '.');
    checkFolder(root);
    const name = request.name ?? titleFromFolderName(basename(root));
    const renderer = request.renderer ?? 'forward_plus';
    const windowSize = request.windowSize ?? defaultWindowSize;
    const versionBranch = await this.dependencies.readVersionBranch();
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, projectFileName), projectFileText({ name, renderer, windowSize, versionBranch }));
    writeFileSync(join(root, 'main.tscn'), mainSceneText());
    writeFileSync(join(root, '.gitignore'), gitignoreText);
    writeFileSync(join(root, '.gitattributes'), gitattributesText);
    writeFileSync(join(root, '.editorconfig'), editorconfigText);
    const installation = this.dependencies.installAddon(root);
    if (!installation.succeeded) {
      throw new ProjectCreationError(`Created the project in ${root}, but the addon could not be installed: ${installation.lines.join(' ')}`);
    }
    return { root, name, renderer, windowSize, mainScene: mainScenePath, addon: installation.lines[0] ?? '' };
  }
}

function checkFolder(root: string): void {
  if (!existsSync(root)) {
    return;
  }
  const entries = readdirSync(root);
  if (entries.includes(projectFileName)) {
    throw new ProjectCreationError(`${root} has a Godot project already.`);
  }
  const occupying = entries.filter((entry) => !entry.startsWith('.') && !entry.endsWith(notesExtension));
  if (occupying.length > 0) {
    throw new ProjectCreationError(`${root} is not empty (${occupying.slice(0, 3).join(', ')}); give an empty folder or a new one, such as "my-game".`);
  }
}
