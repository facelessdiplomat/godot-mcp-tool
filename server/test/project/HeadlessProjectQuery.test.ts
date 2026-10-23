import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import type { BinaryLookup } from '../../src/godot/GodotBinaryLocator.js';
import type { ProcessResult, ProcessRunner, ProcessRunOptions } from '../../src/process/ProcessRunner.js';
import { HeadlessProjectQuery } from '../../src/project/HeadlessProjectQuery.js';

const godot: BinaryLookup = { found: true, path: '/opt/godot/godot', source: 'GODOT_BIN' };

class RecordingRunner implements ProcessRunner {
  readonly runs: { readonly command: string; readonly args: readonly string[]; readonly options: ProcessRunOptions }[] = [];

  constructor(private readonly result: ProcessResult) {}

  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    this.runs.push({ command, args, options });
    return Promise.resolve(this.result);
  }
}

describe('reading the project without the editor', () => {
  let projectRoot = '';

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'headless-project-query-'));
    mkdirSync(join(projectRoot, 'addons', 'godot_mcp_tool', 'project'), { recursive: true });
    writeFileSync(join(projectRoot, 'addons', 'godot_mcp_tool', 'project', 'project_query.gd'), 'extends SceneTree\n');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  function queryWith(runner: ProcessRunner, lookup: BinaryLookup = godot): HeadlessProjectQuery {
    return new HeadlessProjectQuery({ projectRoot, locateGodot: () => Promise.resolve(lookup), processRunner: runner });
  }

  it('asks a headless Godot to run the query script of the addon and returns its answer', async () => {
    const runner = new RecordingRunner({
      exitCode: 0,
      stdout: ['Godot Engine v4.8.beta.custom_build', 'GODOT_MCP_TOOL_ANSWER {"id":1,"result":{"actions":[],"unknown":[]}}', ''].join('\n'),
      stderr: '',
    });

    const result = await queryWith(runner).request('input_map.get', { include_builtin: false });

    expect(result).toEqual({ actions: [], unknown: [] });
    expect(runner.runs[0]?.command).toBe('/opt/godot/godot');
    expect(runner.runs[0]?.args).toEqual([
      '--headless',
      '--path',
      projectRoot,
      '-s',
      'res://addons/godot_mcp_tool/project/project_query.gd',
      '--',
      'input_map.get',
      '{"include_builtin":false}',
    ]);
  });

  it('passes on an error that the query reports', async () => {
    const runner = new RecordingRunner({
      exitCode: 0,
      stdout: 'GODOT_MCP_TOOL_ANSWER {"id":1,"error":{"code":-32602,"message":"\\"actions\\" must be a list of names","hint":"Example: [\\"jump\\"]"}}\n',
      stderr: '',
    });

    const failure = await queryWith(runner).request('input_map.get', { actions: 'jump' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BridgeRequestError);
    expect(failure).toMatchObject({ code: -32602, message: '"actions" must be a list of names', hint: 'Example: ["jump"]' });
  });

  it('explains a Godot that read nothing', async () => {
    const runner = new RecordingRunner({ exitCode: 1, stdout: '', stderr: 'ERROR: Could not load project.godot\nSCRIPT ERROR: Parse Error\n' });

    const failure = await queryWith(runner).request('project.info', {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BridgeRequestError);
    expect((failure as BridgeRequestError).message).toBe(
      'Godot did not answer while reading the project without the editor: ERROR: Could not load project.godot | SCRIPT ERROR: Parse Error',
    );
  });

  it('explains a project without the addon of this server', async () => {
    rmSync(join(projectRoot, 'addons'), { recursive: true });

    const failure = await queryWith(new RecordingRunner({ exitCode: 0, stdout: '', stderr: '' })).request('project.info', {}).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BridgeRequestError);
    expect(failure).toMatchObject({
      message: 'The Godot editor is not connected, and reading the project without it needs the addon of this server in the project',
      hint: 'Install it with npx godot-mcp-tool install-addon, or start the editor with editor_launch.',
    });
  });

  it('explains that Godot was not found', async () => {
    const failure = await queryWith(new RecordingRunner({ exitCode: 0, stdout: '', stderr: '' }), { found: false, reason: 'GODOT_BIN is not set.' })
      .request('project.info', {})
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'The Godot editor is not connected, and Godot was not found to read the project without it: GODOT_BIN is not set.',
      hint: 'Set GODOT_BIN to the Godot executable, or start the editor with editor_launch.',
    });
  });
});
