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

    expect(lookup.found).toBe(false);
    expect(!lookup.found && lookup.reason).toContain('GODOT_PROJECT_PATH');
  });
});
