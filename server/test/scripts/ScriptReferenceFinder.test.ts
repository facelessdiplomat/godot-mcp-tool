import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import type { LanguageServerAddress } from '../../src/bridge/EditorConnection.js';
import type { SymbolPosition } from '../../src/lsp/LanguageServerClient.js';
import { ReferenceSearchError, ScriptReferenceFinder } from '../../src/scripts/ScriptReferenceFinder.js';
import { SymbolLookupError } from '../../src/scripts/SymbolLocation.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

const enemyScript = [
  'class_name Enemy',
  'extends Node3D',
  '',
  'const MAX_HEALTH := 10',
  '',
  'var health := MAX_HEALTH',
  '',
  '',
  'func take_damage(amount: int = 1) -> void:',
  '\thealth -= amount',
  '',
  '',
  'func _on_spikes_body_entered(_body: Node3D) -> void:',
  '\ttake_damage(2)',
  '',
].join('\n');

const playerScript = [
  'extends Node3D',
  '',
  'var target: Enemy',
  'var anything',
  '',
  '',
  'func hit() -> void:',
  '\ttarget.take_damage(1)',
  '\tanything.take_damage(4)',
  '\tif target.has_method("take_damage"):',
  '\t\ttarget.call("take_damage", 3)',
  '',
].join('\n');

const connectionUse = { line: 29, kind: 'connections', count: 1, node: 'Goblin', text: '[connection signal="body_entered" from="Spikes" to="Goblin" method="take_damage"]' };

describe('ScriptReferenceFinder', () => {
  let root: string;
  let editor: FakeEditorGateway;
  let traced: (target: SymbolPosition) => SymbolPosition[];
  let address: LanguageServerAddress | undefined;
  const asked: SymbolPosition[] = [];

  function write(resourcePath: string, text: string): void {
    const file = join(root, resourcePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }

  function inEditor(resourcePath: string, line: number, character: number): SymbolPosition {
    return { path: `${root}/${resourcePath}`, line, character };
  }

  function finder(projectRoot: string | undefined = root): ScriptReferenceFinder {
    return new ScriptReferenceFinder({
      projectRoot,
      editor,
      languageServerAddress: () => Promise.resolve(address),
      connect: () =>
        Promise.resolve({
          references: (target) => {
            asked.push(target);
            return Promise.resolve(traced(target));
          },
          close: () => undefined,
        }),
    });
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'reference-finder-')));
    write('project.godot', 'config_version=5\n');
    write('enemy.gd', enemyScript);
    write('player.gd', playerScript);
    write('addons/tools/spawner.gd', 'extends Node\n\n\nfunc spawn(enemy: Enemy) -> void:\n\tenemy.take_damage(0)\n');
    editor = new FakeEditorGateway().respondTo('editor.unsaved_files', { scenes: [], scripts: [] }).respondTo('editor.rescan', {});
    address = { port: 6005, projectPath: root };
    asked.length = 0;
    traced = () => [
      inEditor('player.gd', 7, 8),
      inEditor('enemy.gd', 8, 5),
      inEditor('enemy.gd', 13, 1),
      inEditor('addons/tools/spawner.gd', 4, 7),
    ];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports the declaration, the traced uses, the uses in scenes and the mentions it could not trace', async () => {
    editor.respondTo('script.find_in_resources', { files: [{ path: 'res://arena.tscn', uses: [connectionUse] }] });

    const report = await finder().find({ path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(asked).toEqual([inEditor('enemy.gd', 8, 5)]);
    expect(editor.requests.map((request) => request.method)).toEqual(['editor.unsaved_files', 'editor.rescan', 'script.find_in_resources']);
    expect(editor.requests[2]?.params).toEqual({ script: 'res://enemy.gd', symbol: 'take_damage', kind: 'function' });
    expect(report).toEqual({
      symbol: 'take_damage',
      kind: 'function',
      script: 'res://enemy.gd',
      declaration: { resourcePath: 'res://enemy.gd', line: 9, text: 'func take_damage(amount: int = 1) -> void:' },
      code: [
        { resourcePath: 'res://enemy.gd', line: 14, text: 'take_damage(2)' },
        { resourcePath: 'res://player.gd', line: 8, text: 'target.take_damage(1)' },
      ],
      resources: [{ resourcePath: 'res://arena.tscn', uses: [connectionUse] }],
      mentions: [
        { resourcePath: 'res://player.gd', line: 9, text: 'anything.take_damage(4)' },
        { resourcePath: 'res://player.gd', line: 10, text: 'if target.has_method("take_damage"):' },
        { resourcePath: 'res://player.gd', line: 11, text: 'target.call("take_damage", 3)' },
      ],
      unsavedFiles: [],
    });
  });

  it('looks in scenes only for functions, signals and variables', async () => {
    traced = () => [inEditor('enemy.gd', 3, 6), inEditor('enemy.gd', 5, 14)];

    const report = await finder().find({ path: 'res://enemy.gd', symbol: 'MAX_HEALTH' });

    expect(editor.requests.map((request) => request.method)).toEqual(['editor.unsaved_files', 'editor.rescan']);
    expect(report.kind).toBe('constant');
    expect(report.code).toEqual([{ resourcePath: 'res://enemy.gd', line: 6, text: 'var health := MAX_HEALTH' }]);
    expect(report.resources).toEqual([]);
  });

  it('names the files with unsaved changes, which it reads as they are on disk', async () => {
    editor = new FakeEditorGateway()
      .respondTo('editor.unsaved_files', { scenes: ['res://arena.tscn'], scripts: ['res://player.gd'] })
      .respondTo('editor.rescan', {})
      .respondTo('script.find_in_resources', { files: [] });

    const report = await finder().find({ path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(report.unsavedFiles).toEqual(['res://arena.tscn', 'res://player.gd']);
  });

  it('still searches when the editor holds changes and refuses the rescan', async () => {
    editor = new FakeEditorGateway()
      .respondTo('editor.unsaved_files', { scenes: [], scripts: [] })
      .respondTo('editor.rescan', new BridgeRequestError('Changes are held in the editor, so this was not done', -32011, undefined, undefined))
      .respondTo('script.find_in_resources', { files: [] });

    const report = await finder().find({ path: 'res://enemy.gd', symbol: 'take_damage' });

    expect(report.code).toHaveLength(2);
  });

  it('says which script to pass when the one given does not declare the symbol', async () => {
    await expect(finder().find({ path: 'res://player.gd', symbol: 'take_damage' })).rejects.toThrow(
      new SymbolLookupError('res://player.gd declares no take_damage; pass the script that declares it, such as the one with "func take_damage(".'),
    );
  });

  it('needs a project and the language server of the editor', async () => {
    address = undefined;

    await expect(finder(undefined).find({ path: 'res://enemy.gd', symbol: 'take_damage' })).rejects.toBeInstanceOf(ReferenceSearchError);
    await expect(finder().find({ path: 'res://enemy.gd', symbol: 'take_damage' })).rejects.toThrow(
      'Finding references needs the language server of the Godot editor, and the editor is not connected. Start it with editor_launch.',
    );
  });
});
