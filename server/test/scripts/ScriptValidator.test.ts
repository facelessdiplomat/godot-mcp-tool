import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageServerUnavailableError, type ScriptText } from '../../src/lsp/LanguageServerClient.js';
import type { ScriptProblem } from '../../src/scripts/ScriptProblem.js';
import { type LanguageServerAddress, ScriptValidator, type ScriptValidatorDependencies, ValidationUnavailableError } from '../../src/scripts/ScriptValidator.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

const brokenLine = 'SCRIPT ERROR: Parse Error: Identifier "spd" not declared in the current scope.\n          at: GDScript::reload (res://player.gd:2)\n';

describe('ScriptValidator', () => {
  let root: string;
  let editor: FakeEditorGateway;
  let diagnosedScripts: ScriptText[];
  let checkedScripts: string[];

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'script-validator-')));
    mkdirSync(join(root, 'enemies'));
    writeFileSync(join(root, 'player.gd'), 'extends Node\nvar speed = spd\n');
    writeFileSync(join(root, 'enemies', 'goblin.gd'), 'extends Node\n');
    editor = new FakeEditorGateway().respondTo('editor.rescan', { duration_ms: 12 });
    diagnosedScripts = [];
    checkedScripts = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function validator(overrides: Partial<ScriptValidatorDependencies> = {}): ScriptValidator {
    return new ScriptValidator({
      projectRoot: root,
      editor,
      languageServerAddress: () => Promise.resolve<LanguageServerAddress | undefined>({ port: 6005, projectPath: '/editor/sees/project' }),
      connectLanguageServer: () =>
        Promise.resolve({
          diagnose: (scripts: readonly ScriptText[]) => {
            diagnosedScripts.push(...scripts);
            return Promise.resolve(
              new Map<string, ScriptProblem[]>(
                scripts.map((script) => [script.path, script.text.includes('spd') ? [{ line: 2, column: 13, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' }] : []]),
              ),
            );
          },
          close: () => undefined,
        }),
      runCheckOnly: (resourcePath) => {
        checkedScripts.push(resourcePath);
        return Promise.resolve(resourcePath === 'res://player.gd' ? brokenLine : '');
      },
      readAutoloadNames: () => [],
      ...overrides,
    });
  }

  it('asks the language server of the editor after a rescan, with paths as the editor sees them', async () => {
    const result = await validator().validate(['res://']);

    expect(editor.requests.map((request) => request.method)).toEqual(['editor.rescan']);
    expect(diagnosedScripts.map((script) => script.path)).toEqual(['/editor/sees/project/enemies/goblin.gd', '/editor/sees/project/player.gd']);
    expect(diagnosedScripts[1]?.text).toBe('extends Node\nvar speed = spd\n');
    expect(result).toEqual({
      method: 'language server',
      reports: [
        { resourcePath: 'res://enemies/goblin.gd', problems: [] },
        { resourcePath: 'res://player.gd', problems: [{ line: 2, column: 13, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' }] },
      ],
    });
  });

  it('checks scripts with godot --check-only when the editor is not connected', async () => {
    const result = await validator({ languageServerAddress: () => Promise.resolve(undefined) }).validate(['res://player.gd', 'res://enemies']);

    expect(checkedScripts.sort()).toEqual(['res://enemies/goblin.gd', 'res://player.gd']);
    expect(result).toEqual({
      method: 'check-only',
      reports: [
        { resourcePath: 'res://player.gd', problems: [{ line: 2, severity: 'error', message: 'Identifier "spd" not declared in the current scope.' }] },
        { resourcePath: 'res://enemies/goblin.gd', problems: [] },
      ],
    });
  });

  it('falls back to godot --check-only and says why when the language server is not available', async () => {
    const result = await validator({
      connectLanguageServer: () => Promise.reject(new LanguageServerUnavailableError('The language server on port 6005 belongs to another project (/other).')),
    }).validate(['res://player.gd']);

    expect(result.method).toBe('check-only');
    expect(result.fallbackReason).toBe('The language server on port 6005 belongs to another project (/other).');
  });

  it('still validates when the rescan fails', async () => {
    editor = new FakeEditorGateway().respondTo('editor.rescan', new Error('The editor bridge connection is closed.'));

    const result = await validator().validate(['res://player.gd']);

    expect(result.method).toBe('language server');
  });

  it('explains that there is no project to check', async () => {
    await expect(validator({ projectRoot: undefined }).validate(['res://player.gd'])).rejects.toBeInstanceOf(ValidationUnavailableError);
  });
});
