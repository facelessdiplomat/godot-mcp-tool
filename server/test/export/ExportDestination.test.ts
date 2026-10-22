import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExportDestination } from '../../src/export/ExportDestination.js';
import { ExportError } from '../../src/export/ExportError.js';

describe('ExportDestination', () => {
  let projectRoot = '';
  let outsideFolder = '';

  function write(relativePath: string): void {
    const path = join(projectRoot, relativePath);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, '');
  }

  function refusal(requestedPath: string): string {
    try {
      ExportDestination.resolve(projectRoot, requestedPath);
    } catch (error) {
      if (error instanceof ExportError) {
        return error.message;
      }
      throw error;
    }
    throw new Error(`${requestedPath} was not refused`);
  }

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'export-destination-')));
    outsideFolder = realpathSync(mkdtempSync(join(tmpdir(), 'export-outside-')));
    write('project.godot');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(outsideFolder, { recursive: true, force: true });
  });

  it('creates a new build folder with a .gdignore file, so the editor does not import the exported files', () => {
    const destination = ExportDestination.resolve(projectRoot, 'build/macos/game.zip');
    destination.prepare();

    expect(destination.relativePath).toBe('build/macos/game.zip');
    expect(destination.absolutePath).toBe(join(projectRoot, 'build', 'macos', 'game.zip'));
    expect(destination.folder).toBe(join(projectRoot, 'build', 'macos'));
    expect(destination.ignoredFolder).toBe('build');
    expect(existsSync(join(projectRoot, 'build', '.gdignore'))).toBe(true);
    expect(existsSync(join(projectRoot, 'build', 'macos'))).toBe(true);
  });

  it('takes res:// paths and absolute paths inside the project', () => {
    expect(ExportDestination.resolve(projectRoot, 'res://build/game.pck').relativePath).toBe('build/game.pck');
    expect(ExportDestination.resolve(projectRoot, join(projectRoot, 'build', 'game.pck')).relativePath).toBe('build/game.pck');
  });

  it('leaves folders that the editor already ignores as they are', () => {
    write('build/.gdignore');

    const destination = ExportDestination.resolve(projectRoot, 'build/web/index.html');

    expect(destination.ignoredFolder).toBeUndefined();
  });

  it('hides an existing folder that holds only earlier exports', () => {
    write('build/game.zip');

    expect(ExportDestination.resolve(projectRoot, 'build/game.zip').ignoredFolder).toBe('build');
  });

  it('hides the first new folder below an existing folder that the editor sees', () => {
    write('exports/notes.txt');

    expect(ExportDestination.resolve(projectRoot, 'exports/macos/game.zip').ignoredFolder).toBe('exports/macos');
  });

  it('refuses paths outside the project, the project folder itself and hidden folders', () => {
    expect(refusal('../builds/game.zip')).toBe(
      '../builds/game.zip is outside the project. export_project writes only inside the project folder: pass output inside it, such as "build/game.zip", or export to other places from Project → Export in the editor.',
    );
    expect(refusal(join(outsideFolder, 'game.zip'))).toContain('is outside the project');
    expect(refusal('res://../game.zip')).toContain('is outside the project');
    expect(refusal('game.zip')).toBe('Export into a folder of its own inside the project, such as "build/game.zip", not into the project folder itself.');
    expect(refusal('.godot/game.pck')).toBe('.godot/game.pck is in the hidden folder .godot; export into a visible folder, such as "build/game.pck".');
    expect(refusal('.git/hooks/pre-commit')).toContain('is in the hidden folder .git');
  });

  it('refuses folders that hold project files', () => {
    write('levels/arena.tscn');

    expect(refusal('levels/game.pck')).toBe(
      'levels/ holds project files, such as levels/arena.tscn. Export into a folder of its own, such as "build/game.pck", which gets a .gdignore file so the editor does not import the exported files.',
    );
  });

  it('refuses a path through a file', () => {
    write('main.tscn');

    expect(refusal('main.tscn/game.pck')).toBe('main.tscn is a file, so main.tscn/game.pck cannot be written; export into a folder, such as "build/game.pck".');
  });

  it('refuses a symbolic link that leads outside the project', () => {
    symlinkSync(outsideFolder, join(projectRoot, 'build'));

    expect(refusal('build/game.zip')).toContain('build/game.zip is outside the project');
  });
});
