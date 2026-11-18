import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { succeeded } from '../../src/cli/CommandReport.js';
import { ProjectCreationError, ProjectCreator } from '../../src/project/ProjectCreator.js';

describe('creating a project', () => {
  let workspace: string;
  let installedIn: string[];

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'project-creator-')));
    installedIn = [];
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function creator(versionBranch: string | undefined = '4.8'): ProjectCreator {
    return new ProjectCreator({
      workingDirectory: workspace,
      installAddon: (projectRoot) => {
        installedIn.push(projectRoot);
        return succeeded('Installed the Godot MCP Tool addon 0.1.2.');
      },
      readVersionBranch: () => Promise.resolve(versionBranch),
    });
  }

  it('writes the project, its main scene and the ignore files into a new folder and installs the addon', async () => {
    const created = await creator().create({ path: 'capsule-walk' });
    const root = join(workspace, 'capsule-walk');

    expect(created).toEqual({ root, name: 'Capsule Walk', renderer: 'forward_plus', windowSize: [1152, 648], mainScene: 'res://main.tscn', addon: 'Installed the Godot MCP Tool addon 0.1.2.' });
    expect(readFileSync(join(root, 'project.godot'), 'utf8')).toContain('config/name="Capsule Walk"');
    expect(readFileSync(join(root, 'main.tscn'), 'utf8')).toContain('[node name="Main" type="Node3D"]');
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toContain('.godot/');
    expect(existsSync(join(root, '.gitattributes'))).toBe(true);
    expect(existsSync(join(root, '.editorconfig'))).toBe(true);
    expect(installedIn).toEqual([root]);
  });

  it('takes a folder that holds only hidden files and notes', async () => {
    writeFileSync(join(workspace, '.mcp.json'), '{}');
    writeFileSync(join(workspace, 'CLAUDE.md'), '# Notes\n');
    mkdirSync(join(workspace, '.claude'));

    const created = await creator().create({ name: 'Arena', renderer: 'mobile', windowSize: [1280, 720] });

    expect(created.root).toBe(workspace);
    expect(readFileSync(join(workspace, 'project.godot'), 'utf8')).toContain('renderer/rendering_method="mobile"');
  });

  it('refuses a folder with a project or with other files', async () => {
    writeFileSync(join(workspace, 'project.godot'), 'config_version=5\n');
    mkdirSync(join(workspace, 'busy'));
    writeFileSync(join(workspace, 'busy', 'server.js'), '');

    await expect(creator().create({})).rejects.toThrow(new ProjectCreationError(`${workspace} has a Godot project already.`));
    await expect(creator().create({ path: 'busy' })).rejects.toThrow(
      new ProjectCreationError(`${join(workspace, 'busy')} is not empty (server.js); give an empty folder or a new one, such as "my-game".`),
    );
    expect(installedIn).toEqual([]);
  });
});
