import type { ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCommandLine } from '../../src/cli/CommandLine.js';
import { runCommand } from '../../src/cli/runCommand.js';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject } from './harness.js';

const windowed = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

const brokenScript = ['extends Node', '', '', 'func _ready() -> void:', '\tprint(SPEEDD)', ''].join('\n');
const fixedScript = ['extends Node', '', 'const SPEED := 3.0', '', '', 'func _ready() -> void:', '\tprint(SPEED)', ''].join('\n');
const scriptWithUnusedVariable = ['extends Node', '', '', 'func _ready() -> void:', '\tvar jump_height := 2.0', ''].join('\n');

interface HookRun {
  readonly exitCode: number;
  readonly output: readonly string[];
  readonly errors: readonly string[];
}

describe.skipIf(godotBinary === '')('the hook that checks a script after Claude writes it', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let languageServerPort = 0;

  function workspace(): TemporaryProject {
    if (project === undefined) {
      throw new Error('The project is not ready');
    }
    return project;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP edited script hook');
    project.write('player.gd', brokenScript);
    languageServerPort = await findFreePort();
    editorProcess = windowed
      ? await startWindowedEditor(project.root, { languageServer: languageServerPort })
      : await startHeadlessEditor(project.root, { languageServer: languageServerPort });
  }, editorStartupTimeoutMs);

  afterAll(() => {
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  async function runHookAfterWriting(relativePath: string): Promise<HookRun> {
    const output: string[] = [];
    const errors: string[] = [];
    const request = parseCommandLine(['check-edited-script']);
    if (request.kind !== 'check-edited-script') {
      throw new Error('Expected the hook command');
    }
    const hookInput = { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: workspace().path(relativePath), content: '' } };
    const exitCode = await runCommand(
      request,
      {
        variables: { GODOT_LSP_PORT: String(languageServerPort) },
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

  it('shows Claude the errors that the editor finds in the script', async () => {
    const run = await runHookAfterWriting('player.gd');

    expect(run.exitCode).toBe(2);
    expect(run.output).toEqual([]);
    expect(run.errors.slice(0, 2)).toEqual(["1 error in 1 of 1 script (checked with the editor's language server).", 'res://player.gd']);
    expect(run.errors[2]).toMatch(/^ {2}5:\d+ error.*SPEEDD/);
  });

  it('says nothing about a script without problems', async () => {
    workspace().write('player.gd', fixedScript);

    expect(await runHookAfterWriting('player.gd')).toEqual({ exitCode: 0, output: [], errors: [] });
  });

  it('adds warnings to the context of Claude without an error', async () => {
    workspace().write('player.gd', scriptWithUnusedVariable);

    const run = await runHookAfterWriting('player.gd');

    expect(run.exitCode).toBe(0);
    expect(run.errors).toEqual([]);
    expect(JSON.parse(run.output[0] ?? '{}')).toMatchObject({ hookSpecificOutput: { hookEventName: 'PostToolUse' } });
    expect(run.output[0]).toContain('UNUSED_VARIABLE');
  });

  it('keeps errors that the hook showed out of later tool results once the script is fixed', async () => {
    const session = await McpSession.connect(workspace().root, { GODOT_LSP_PORT: String(languageServerPort) });
    try {
      await session.call('godot_status');
      workspace().write('enemy.gd', brokenScript);
      const broken = await runHookAfterWriting('enemy.gd');
      workspace().write('enemy.gd', fixedScript);
      const fixed = await runHookAfterWriting('enemy.gd');

      const info = await session.call('project_info');

      expect(broken.exitCode).toBe(2);
      expect(fixed).toEqual({ exitCode: 0, output: [], errors: [] });
      expect(info.text).not.toContain('⚠');
    } finally {
      await session.close();
    }
  });
});
