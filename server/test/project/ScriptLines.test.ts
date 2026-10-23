import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readScriptLines } from '../../src/project/ScriptLines.js';

describe('readScriptLines', () => {
  let projectRoot = '';
  let outsideFolder = '';

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'script-lines-')));
    outsideFolder = realpathSync(mkdtempSync(join(tmpdir(), 'script-lines-outside-')));
    writeFileSync(join(projectRoot, 'player.gd'), 'extends Node\r\n\r\nvar speed := 4.5\n');
    writeFileSync(join(outsideFolder, 'secret.gd'), 'var token := "x"\n');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(outsideFolder, { recursive: true, force: true });
  });

  it('reads the lines of a script of the project', () => {
    expect(readScriptLines(projectRoot, 'res://player.gd')).toEqual(['extends Node', '', 'var speed := 4.5', '']);
  });

  it('reads nothing outside the project or from missing files', () => {
    const relativeOutside = `res://../${outsideFolder.split('/').at(-1) ?? ''}/secret.gd`;

    expect(readScriptLines(projectRoot, relativeOutside)).toBeUndefined();
    expect(readScriptLines(projectRoot, 'res://enemy.gd')).toBeUndefined();
  });
});
