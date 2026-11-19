import { type ChildProcess, execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCommandLine } from '../../src/cli/CommandLine.js';
import { runCommand } from '../../src/cli/runCommand.js';
import { editorStartupTimeoutMs, godotBinary, startHeadlessEditor, stopDiscoveredEditor, TemporaryProject } from './harness.js';

const runProcess = promisify(execFile);
const arena = ['[gd_scene format=3]', '', '[node name="Arena" type="Node3D"]', ''].join('\n');

interface HookRun {
  readonly exitCode: number;
  readonly output: readonly string[];
  readonly errors: readonly string[];
}

describe.skipIf(godotBinary === '')('the hook that keeps scenes from being edited as text while the editor has them', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;

  function workspace(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP scene edit hook');
    project.write('arena.tscn', arena);
    await runProcess(godotBinary, ['--headless', '--path', project.root, '--import'], { timeout: editorStartupTimeoutMs });
  }, editorStartupTimeoutMs);

  afterAll(() => {
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  async function runHookBeforeEditing(relativePath: string): Promise<HookRun> {
    const output: string[] = [];
    const errors: string[] = [];
    const request = parseCommandLine(['check-scene-edit']);
    if (request.kind !== 'check-scene-edit') {
      throw new Error('Expected the hook command');
    }
    const hookInput = { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: workspace().path(relativePath), old_string: 'Arena', new_string: 'Level' } };
    const exitCode = await runCommand(
      request,
      {
        variables: {},
        workingDirectory: workspace().root,
        platform: process.platform,
        homeDirectory: homedir(),
        nodeVersion: process.versions.node,
        bundledAddonDirectory: '',
        readInput: () => Promise.resolve(JSON.stringify(hookInput)),
      },
      { write: (line) => output.push(line), writeError: (line) => errors.push(line) },
    );
    return { exitCode, output, errors };
  }

  it('lets the edit through after the editor of the project closed', async () => {
    expect(await runHookBeforeEditing('arena.tscn')).toEqual({ exitCode: 0, output: [], errors: [] });
  });

  it('denies the edit while the editor is open, with the tools to use instead', async () => {
    editorProcess = await startHeadlessEditor(workspace().root);

    const run = await runHookBeforeEditing('arena.tscn');

    expect(run.exitCode).toBe(0);
    expect(run.errors).toEqual([]);
    const answer = JSON.parse(run.output[0] ?? '{}') as { readonly hookSpecificOutput?: { readonly permissionDecision?: string; readonly permissionDecisionReason?: string } };
    expect(answer.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(answer.hookSpecificOutput?.permissionDecisionReason).toMatch(/^res:\/\/arena\.tscn was not changed: the Godot editor is open on this project/);
    expect(answer.hookSpecificOutput?.permissionDecisionReason).toContain('scene_batch_edit');
  }, editorStartupTimeoutMs);

  it('lets the edit through once the editor is gone, even when it could not mark its record closed', async () => {
    await stopDiscoveredEditor(workspace().root);
    editorProcess = undefined;

    expect(await runHookBeforeEditing('arena.tscn')).toEqual({ exitCode: 0, output: [], errors: [] });
  });
});
