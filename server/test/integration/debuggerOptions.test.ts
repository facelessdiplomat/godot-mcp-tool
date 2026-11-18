import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = [
  'extends Node3D',
  '',
  'var health := 10',
  '',
  '',
  'func _ready() -> void:',
  '\tvar damage := damage_of(3)',
  '\thealth -= damage',
  '',
  '',
  'func damage_of(amount: int) -> int:',
  '\tvar doubled := amount * 2',
  '\treturn doubled',
  '',
].join('\n');

const brokenScript = ['extends Node3D', '', '', 'func _ready() -> void:', '\tvar missing: Node = null', '\tmissing.queue_free()', ''].join('\n');

const sceneWith = (script: string): string =>
  ['[gd_scene load_steps=2 format=3]', '', `[ext_resource type="Script" path="res://${script}" id="1_script"]`, '', '[node name="Main" type="Node3D"]', 'script = ExtResource("1_script")', ''].join('\n');

const doubledLine = mainScript.split('\n').indexOf('\tvar doubled := amount * 2') + 1;

describe.skipIf(godotBinary === '')('evaluating, stepping out and stopping at the first error', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP debugger options', { mainScene: 'res://main.tscn' });
    project.write('main.gd', mainScript);
    project.write('main.tscn', sceneWith('main.gd'));
    project.write('broken.gd', brokenScript);
    project.write('broken.tscn', sceneWith('broken.gd'));
    const debugAdapterPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, { debugAdapter: debugAdapterPort });
    session = await McpSession.connect(project.root, { GODOT_DAP_PORT: String(debugAdapterPort) });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('evaluates an expression where the game stopped and steps out to the caller', async () => {
    await tools().call('debug_breakpoints', { add: [`res://main.gd:${String(doubledLine)}`] });
    await tools().call('game_run');

    const stopped = await tools().call('debug_state', { wait_ms: 10_000, expression: 'amount * 10' });
    const steppedOut = await tools().call('debug_continue', { action: 'step_out' });
    await tools().call('debug_breakpoints', { clear: true });
    await tools().call('debug_continue');
    await tools().call('game_stop');

    expect(stopped.text).toContain(`stopped at a breakpoint at res://main.gd:${String(doubledLine)} in damage_of`);
    expect(stopped.text).toContain('amount * 10 = 30 (evaluated in #0)');
    expect(steppedOut.text).toMatch(/^Stepped out to res:\/\/main\.gd:\d+ in _ready:/);
  });

  it('stops at the first script error when asked and runs on otherwise', async () => {
    const goingOn = await tools().call('game_run', { scene: 'res://broken.tscn' });
    const notStopped = await tools().call('debug_state');
    await tools().call('game_stop');
    await tools().call('game_run', { scene: 'res://broken.tscn', break_on_error: true });
    const stoppedOnError = await tools().call('debug_state', { wait_ms: 10_000 });
    await tools().call('debug_continue');
    await tools().call('game_stop');

    expect(goingOn.text).toContain('queue_free');
    expect(notStopped.text).toContain('The game is not stopped in the debugger');
    expect(stoppedOnError.text).toMatch(/^The game stopped on an error at res:\/\/broken\.gd:6 in _ready/);
  });
});
