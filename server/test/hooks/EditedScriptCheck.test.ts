import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditedScriptCheck } from '../../src/hooks/EditedScriptCheck.js';
import { type ValidationResult, ValidationUnavailableError } from '../../src/scripts/ScriptValidator.js';

const brokenPlayer: ValidationResult = {
  method: 'language server',
  reports: [{ resourcePath: 'res://player/player.gd', problems: [{ line: 12, column: 5, severity: 'error', message: 'Identifier "SPEEDD" not declared in the current scope.' }] }],
};

const untidyPlayer: ValidationResult = {
  method: 'language server',
  reports: [{ resourcePath: 'res://player/player.gd', problems: [{ line: 3, column: 5, severity: 'warning', code: 'UNUSED_VARIABLE', message: 'The local variable "jump" is declared but never used.' }] }],
};

describe('checking a script that Claude just wrote or edited', () => {
  let workspace: string;
  let projectRoot: string;
  let scriptPath: string;
  let checked: { readonly projectRoot: string; readonly scriptPath: string }[];
  let validation: () => Promise<ValidationResult>;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'edited-script-'));
    projectRoot = join(workspace, 'game');
    mkdirSync(join(projectRoot, 'player'), { recursive: true });
    writeFileSync(join(projectRoot, 'project.godot'), 'config_version=5\n');
    scriptPath = join(projectRoot, 'player', 'player.gd');
    writeFileSync(scriptPath, 'extends CharacterBody3D\n');
    checked = [];
    validation = () => Promise.resolve({ method: 'language server', reports: [{ resourcePath: 'res://player/player.gd', problems: [] }] });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function check(hookInput: unknown): ReturnType<EditedScriptCheck['check']> {
    return new EditedScriptCheck((root, script) => {
      checked.push({ projectRoot: root, scriptPath: script });
      return validation();
    }).check(hookInput);
  }

  function editOf(filePath: string): unknown {
    return { hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' }, tool_response: { success: true } };
  }

  it('checks the edited script in the Godot project around it', async () => {
    expect(await check(editOf(scriptPath))).toEqual({ kind: 'silent' });
    expect(checked).toEqual([{ projectRoot, scriptPath }]);
  });

  it('reports the errors of the script', async () => {
    validation = () => Promise.resolve(brokenPlayer);

    expect(await check(editOf(scriptPath))).toEqual({
      kind: 'problems',
      hasErrors: true,
      report: [
        '1 error in 1 of 1 script (checked with the editor\'s language server).',
        'res://player/player.gd',
        '  12:5 error: Identifier "SPEEDD" not declared in the current scope.',
      ].join('\n'),
    });
  });

  it('reports warnings without calling them errors', async () => {
    validation = () => Promise.resolve(untidyPlayer);

    const outcome = await check(editOf(scriptPath));

    expect(outcome).toMatchObject({ kind: 'problems', hasErrors: false });
  });

  it('leaves files that are not scripts alone', async () => {
    writeFileSync(join(projectRoot, 'level.tscn'), '[gd_scene format=3]\n');

    expect(await check(editOf(join(projectRoot, 'level.tscn')))).toEqual({ kind: 'silent' });
    expect(checked).toEqual([]);
  });

  it('leaves scripts outside a Godot project alone', async () => {
    const looseScript = join(workspace, 'tools', 'helper.gd');
    mkdirSync(join(workspace, 'tools'));
    writeFileSync(looseScript, 'extends RefCounted\n');

    expect(await check(editOf(looseScript))).toEqual({ kind: 'silent' });
    expect(checked).toEqual([]);
  });

  it('stays silent when nothing can check the script', async () => {
    validation = () => Promise.reject(new ValidationUnavailableError('The Godot editor is not connected, and scripts cannot be checked without it.'));

    expect(await check(editOf(scriptPath))).toEqual({ kind: 'silent' });
  });

  it('ignores input without the path of an edited file', async () => {
    expect(await check({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } })).toEqual({ kind: 'silent' });
    expect(await check('not an object')).toEqual({ kind: 'silent' });
    expect(checked).toEqual([]);
  });
});
