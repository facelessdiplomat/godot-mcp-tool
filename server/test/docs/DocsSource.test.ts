import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DocsSource, DocsUnavailableError } from '../../src/docs/DocsSource.js';
import type { ProcessResult, ProcessRunner, ProcessRunOptions } from '../../src/process/ProcessRunner.js';

const binaryPath = '/opt/godot/godot';

const engineApi = {
  classes: [{ name: 'Node', inherits: 'Object', brief_description: 'Base class for all scene objects.', description: '' }],
  builtin_classes: [],
  utility_functions: [],
  global_enums: [],
};

const goblinXml = '<class name="Goblin" inherits="CharacterBody3D"><brief_description>A small enemy.</brief_description></class>';

class FakeGodot implements ProcessRunner {
  readonly calls: string[][] = [];
  version = '4.8.beta.custom_build.abc1234';

  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    this.calls.push([command, ...args]);
    if (args.includes('--version')) {
      return Promise.resolve({ exitCode: 0, stdout: `${this.version}\n`, stderr: '' });
    }
    if (args.includes('--dump-extension-api-with-docs') && options.cwd !== undefined) {
      writeFileSync(join(options.cwd, 'extension_api.json'), JSON.stringify(engineApi));
    }
    const docsFolder = args[args.indexOf('--doctool') + 1];
    if (args.includes('--gdscript-docs') && docsFolder !== undefined) {
      writeFileSync(join(docsFolder, 'Goblin.xml'), goblinXml);
      writeFileSync(join(docsFolder, 'helper.gd.xml'), '<class name="&quot;helper.gd&quot;" inherits="Node"></class>');
    }
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  }

  callsWith(flag: string): number {
    return this.calls.filter((call) => call.includes(flag)).length;
  }
}

describe('DocsSource', () => {
  let workspace = '';
  let projectRoot = '';
  let cacheDirectory = '';
  let godot: FakeGodot;

  function source(): DocsSource {
    return sourceFor(projectRoot);
  }

  function sourceFor(root: string | undefined): DocsSource {
    return new DocsSource({
      projectRoot: root,
      cacheDirectory,
      locateBinary: () => Promise.resolve({ found: true, path: binaryPath, source: 'GODOT_BIN' }),
      processRunner: godot,
    });
  }

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(join(tmpdir(), 'docs-source-')));
    projectRoot = join(workspace, 'game');
    cacheDirectory = join(workspace, 'cache');
    mkdirSync(join(projectRoot, 'enemies'), { recursive: true });
    writeFileSync(join(projectRoot, 'project.godot'), 'config_version=5\n');
    writeFileSync(join(projectRoot, 'enemies', 'goblin.gd'), 'class_name Goblin\nextends CharacterBody3D\n');
    godot = new FakeGodot();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('dumps the engine API once per engine version and keeps it in the cache', async () => {
    const library = await source().load();
    await source().load();

    expect(library.find('Node')?.brief).toBe('Base class for all scene objects.');
    expect(godot.callsWith('--dump-extension-api-with-docs')).toBe(1);
    expect(existsSync(join(cacheDirectory, 'docs', '4.8.beta.custom_build.abc1234', 'extension_api.json'))).toBe(true);
  });

  it('shares one load between calls that come at the same time', async () => {
    const docsSource = source();

    await Promise.all([docsSource.load(), docsSource.load()]);

    expect(godot.callsWith('--dump-extension-api-with-docs')).toBe(1);
    expect(godot.callsWith('--gdscript-docs')).toBe(1);
  });

  it('dumps the engine API again for another engine version', async () => {
    await source().load();
    godot.version = '4.8.beta.custom_build.def5678';

    await source().load();

    expect(godot.callsWith('--dump-extension-api-with-docs')).toBe(2);
  });

  it('dumps again when the cached API is broken', async () => {
    const folder = join(cacheDirectory, 'docs', '4.8.beta.custom_build.abc1234');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'extension_api.json'), '{"classes": [');

    const library = await source().load();

    expect(library.find('Node')).toBeDefined();
    expect(godot.callsWith('--dump-extension-api-with-docs')).toBe(1);
  });

  it('reads the documented classes of the project with their scripts', async () => {
    const library = await source().load();

    expect(library.find('Goblin')).toMatchObject({ origin: 'project', scriptPath: 'res://enemies/goblin.gd', brief: 'A small enemy.' });
    expect(library.find('helper.gd')).toBeUndefined();
    expect(godot.calls.find((call) => call.includes('--gdscript-docs'))).toEqual([
      binaryPath,
      '--headless',
      '--path',
      projectRoot,
      '--doctool',
      join(projectRoot, '.godot', 'godot_mcp_tool', 'class_docs'),
      '--gdscript-docs',
      'res://',
    ]);
  });

  it('documents the project again only after a script changed', async () => {
    const docsSource = source();
    await docsSource.load();
    await docsSource.load();
    await source().load();
    const later = new Date(Date.now() + 60_000);
    utimesSync(join(projectRoot, 'enemies', 'goblin.gd'), later, later);

    await docsSource.load();

    expect(godot.callsWith('--gdscript-docs')).toBe(2);
  });

  it('works without a project', async () => {
    const library = await sourceFor(undefined).load();

    expect(library.find('Node')).toBeDefined();
    expect(godot.callsWith('--gdscript-docs')).toBe(0);
  });

  it('explains that it needs a Godot executable', async () => {
    const docsSource = new DocsSource({
      projectRoot,
      cacheDirectory,
      locateBinary: () => Promise.resolve({ found: false, reason: 'No Godot executable was found.' }),
      processRunner: godot,
    });

    await expect(docsSource.load()).rejects.toThrow(DocsUnavailableError);
    await expect(docsSource.load()).rejects.toThrow('No Godot executable was found.');
  });
});
