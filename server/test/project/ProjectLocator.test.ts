import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectLocator } from '../../src/project/ProjectLocator.js';

describe('ProjectLocator', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'project-locator-'));
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function createProject(directory: string): string {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'project.godot'), '');
    return directory;
  }

  it('takes up the project that project_create made in a session that started without one', () => {
    const projectRoot = createProject(join(sandbox, 'capsule-walk'));
    const locator = new ProjectLocator({}, sandbox, undefined, projectRoot);

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'project_create' });
  });

  it('uses GODOT_PROJECT_PATH when it points to a project', () => {
    const projectRoot = createProject(join(sandbox, 'game'));
    const locator = new ProjectLocator({ GODOT_PROJECT_PATH: projectRoot }, sandbox);

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'GODOT_PROJECT_PATH' });
  });

  it('resolves a relative GODOT_PROJECT_PATH against the working directory', () => {
    const projectRoot = createProject(join(sandbox, 'test-project'));
    const locator = new ProjectLocator({ GODOT_PROJECT_PATH: 'test-project' }, sandbox);

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'GODOT_PROJECT_PATH' });
  });

  it('reports a GODOT_PROJECT_PATH without project.godot', () => {
    const emptyDirectory = join(sandbox, 'empty');
    mkdirSync(emptyDirectory);
    const locator = new ProjectLocator({ GODOT_PROJECT_PATH: emptyDirectory }, sandbox);

    const lookup = locator.locate();

    expect(lookup.found).toBe(false);
    expect(!lookup.found && lookup.reason).toContain(emptyDirectory);
  });

  it('prefers a project folder given on the command line', () => {
    const projectRoot = createProject(join(sandbox, 'game'));
    createProject(join(sandbox, 'other'));
    const locator = new ProjectLocator({ GODOT_PROJECT_PATH: join(sandbox, 'other') }, sandbox, 'game');

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'command line' });
  });

  it('reports a command line folder without project.godot', () => {
    mkdirSync(join(sandbox, 'empty'));
    const locator = new ProjectLocator({}, sandbox, 'empty');

    expect(locator.locate()).toEqual({ found: false, reason: `${join(sandbox, 'empty')} has no project.godot.` });
  });

  it('finds the project in CLAUDE_PROJECT_DIR', () => {
    const projectRoot = createProject(join(sandbox, 'game'));
    const locator = new ProjectLocator({ CLAUDE_PROJECT_DIR: projectRoot }, sandbox);

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'CLAUDE_PROJECT_DIR' });
  });

  it('searches upwards from the working directory', () => {
    const projectRoot = createProject(join(sandbox, 'game'));
    const nestedDirectory = join(projectRoot, 'levels', 'arena');
    mkdirSync(nestedDirectory, { recursive: true });
    const locator = new ProjectLocator({}, nestedDirectory);

    expect(locator.locate()).toEqual({ found: true, root: projectRoot, source: 'working directory' });
  });

  it('reports when no project is found', () => {
    const locator = new ProjectLocator({}, sandbox);

    const lookup = locator.locate();

    expect(lookup).toEqual({
      found: false,
      reason: `No project.godot was found in ${sandbox}, its parent folders or the folders up to three levels below it. Set GODOT_PROJECT_PATH to the Godot project folder.`,
    });
  });

  describe('when no project lies above', () => {
    it('finds the one project in a subfolder of the working directory', () => {
      const projectRoot = createProject(join(sandbox, 'repository', 'game'));
      mkdirSync(join(sandbox, 'repository', 'docs'));

      expect(new ProjectLocator({}, join(sandbox, 'repository')).locate()).toEqual({ found: true, root: projectRoot, source: 'subfolder' });
    });

    it('looks below CLAUDE_PROJECT_DIR rather than below the working directory', () => {
      const projectRoot = createProject(join(sandbox, 'repository', 'client', 'godot'));
      createProject(join(sandbox, 'elsewhere', 'game'));

      expect(new ProjectLocator({ CLAUDE_PROJECT_DIR: join(sandbox, 'repository') }, join(sandbox, 'elsewhere')).locate()).toEqual({
        found: true,
        root: projectRoot,
        source: 'subfolder',
      });
    });

    it('finds a project three levels down, but not four', () => {
      const projectRoot = createProject(join(sandbox, 'repository', 'apps', 'client', 'game'));
      createProject(join(sandbox, 'deeper', 'a', 'b', 'c', 'game'));

      expect(new ProjectLocator({}, join(sandbox, 'repository')).locate()).toEqual({ found: true, root: projectRoot, source: 'subfolder' });
      expect(new ProjectLocator({}, join(sandbox, 'deeper')).locate().found).toBe(false);
    });

    it('does not guess between several projects and names them', () => {
      createProject(join(sandbox, 'repository', 'game'));
      createProject(join(sandbox, 'repository', 'tools', 'level-editor'));

      expect(new ProjectLocator({}, join(sandbox, 'repository')).locate()).toEqual({
        found: false,
        reason: `Several Godot projects lie below ${join(sandbox, 'repository')}: game, ${join('tools', 'level-editor')}. Set GODOT_PROJECT_PATH to the folder of the one to use.`,
      });
    });

    it('skips hidden folders, node_modules and folders that Godot ignores', () => {
      const projectRoot = createProject(join(sandbox, 'repository', 'game'));
      createProject(join(sandbox, 'repository', '.cache', 'copy'));
      createProject(join(sandbox, 'repository', 'node_modules', 'some-package', 'demo'));
      createProject(join(sandbox, 'repository', 'vendor', 'samples'));
      writeFileSync(join(sandbox, 'repository', 'vendor', '.gdignore'), '');

      expect(new ProjectLocator({}, join(sandbox, 'repository')).locate()).toEqual({ found: true, root: projectRoot, source: 'subfolder' });
    });

    it('does not look inside a project for projects of its own', () => {
      const projectRoot = createProject(join(sandbox, 'repository', 'game'));
      createProject(join(sandbox, 'repository', 'game', 'addons', 'demo'));

      expect(new ProjectLocator({}, join(sandbox, 'repository')).locate()).toEqual({ found: true, root: projectRoot, source: 'subfolder' });
    });

    it('keeps a project above the working directory before one below it', () => {
      const projectRoot = createProject(join(sandbox, 'game'));
      createProject(join(sandbox, 'game', 'levels', 'test-bed'));

      expect(new ProjectLocator({}, join(sandbox, 'game', 'levels')).locate()).toEqual({ found: true, root: projectRoot, source: 'working directory' });
    });
  });
});
