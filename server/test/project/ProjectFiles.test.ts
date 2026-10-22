import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { filesInFolder, listScenes } from '../../src/project/ProjectFiles.js';

describe('project files', () => {
  let projectRoot = '';

  function touch(relativePath: string): void {
    mkdirSync(dirname(join(projectRoot, relativePath)), { recursive: true });
    writeFileSync(join(projectRoot, relativePath), '');
  }

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'project-files-')));
    for (const file of ['main.tscn', 'levels/arena.tscn', 'levels/old.scn', 'levels/arena.gd', 'addons/gut/GutScene.tscn', '.godot/cache.tscn', 'props/crate.tscn', 'notes.txt']) {
      touch(file);
    }
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('lists the scenes of the project in name order, outside addons and hidden folders', () => {
    expect(listScenes(projectRoot)).toEqual(['res://levels/arena.tscn', 'res://levels/old.scn', 'res://main.tscn', 'res://props/crate.tscn']);
  });

  it('finds files with the given extensions in a folder', () => {
    expect(filesInFolder(projectRoot, join(projectRoot, 'levels'), ['.gd'])).toEqual([{ resourcePath: 'res://levels/arena.gd', absolutePath: join(projectRoot, 'levels', 'arena.gd') }]);
  });
});
