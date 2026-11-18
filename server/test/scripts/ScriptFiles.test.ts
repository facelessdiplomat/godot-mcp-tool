import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findCodeFiles, findScripts, ScriptPathError } from '../../src/scripts/ScriptFiles.js';

describe('findScripts', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'script-files-')));
    for (const folder of ['player', 'player/states', 'addons/gut', '.godot', 'shaders']) {
      mkdirSync(join(root, folder), { recursive: true });
    }
    for (const file of [
      'main.gd',
      'player/player.gd',
      'player/states/jump.gd',
      'player/notes.txt',
      'addons/gut/gut.gd',
      '.godot/cache.gd',
      'shaders/water.gdshader',
      'shaders/colors.gdshaderinc',
    ]) {
      writeFileSync(join(root, file), 'extends Node\n');
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function resourcePaths(inputs: readonly string[]): string[] {
    return findScripts(root, inputs).map((script) => script.resourcePath);
  }

  it('accepts resource paths, paths relative to the project and absolute paths', () => {
    expect(resourcePaths(['res://main.gd', 'player/player.gd', join(root, 'player', 'states', 'jump.gd')])).toEqual([
      'res://main.gd',
      'res://player/player.gd',
      'res://player/states/jump.gd',
    ]);
    expect(findScripts(root, ['res://main.gd'])[0]?.absolutePath).toBe(join(root, 'main.gd'));
  });

  it('finds the scripts of a folder recursively', () => {
    expect(resourcePaths(['res://player/'])).toEqual(['res://player/player.gd', 'res://player/states/jump.gd']);
  });

  it('skips addons and hidden folders when searching the whole project', () => {
    expect(resourcePaths(['res://'])).toEqual(['res://main.gd', 'res://player/player.gd', 'res://player/states/jump.gd']);
  });

  it('searches an addon folder when it is named', () => {
    expect(resourcePaths(['res://addons/gut'])).toEqual(['res://addons/gut/gut.gd']);
  });

  it('lists each script once', () => {
    expect(resourcePaths(['res://player/player.gd', 'res://player'])).toEqual(['res://player/player.gd', 'res://player/states/jump.gd']);
  });

  it('explains a path that does not exist', () => {
    expect(() => findScripts(root, ['res://enemy.gd'])).toThrow(new ScriptPathError('res://enemy.gd does not exist.'));
  });

  it('refuses paths outside the project', () => {
    expect(() => findScripts(root, ['../elsewhere/player.gd'])).toThrow(ScriptPathError);
  });

  it('refuses files that are not scripts', () => {
    expect(() => findScripts(root, ['res://player/notes.txt'])).toThrow(new ScriptPathError('res://player/notes.txt is not a .gd script.'));
  });
});

describe('findCodeFiles', () => {
  let root: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'code-files-')));
    mkdirSync(join(root, 'shaders'), { recursive: true });
    mkdirSync(join(root, 'player'), { recursive: true });
    for (const file of ['player/player.gd', 'player/glow.gdshader', 'shaders/water.gdshader', 'shaders/colors.gdshaderinc', 'shaders/readme.md']) {
      writeFileSync(join(root, file), '');
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('sorts scripts and shaders of files and folders apart', () => {
    const found = findCodeFiles(root, ['res://player', 'res://shaders/water.gdshader']);

    expect(found.scripts.map((script) => script.resourcePath)).toEqual(['res://player/player.gd']);
    expect(found.shaders.map((shader) => shader.resourcePath)).toEqual(['res://player/glow.gdshader', 'res://shaders/water.gdshader']);
  });

  it('checks shader includes through the shaders that include them', () => {
    expect(() => findCodeFiles(root, ['res://shaders/colors.gdshaderinc'])).toThrow(
      new ScriptPathError('res://shaders/colors.gdshaderinc is a shader include; check a .gdshader file that includes it.'),
    );
  });

  it('refuses files that are neither scripts nor shaders', () => {
    expect(() => findCodeFiles(root, ['res://shaders/readme.md'])).toThrow(new ScriptPathError('res://shaders/readme.md is not a .gd script or a .gdshader file.'));
  });
});
