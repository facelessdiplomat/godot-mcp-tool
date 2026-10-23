import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, findFreePort, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const mainScript = [
  'extends Node3D',
  '',
  'var counter := 0',
  'var speed := 4.5',
  '',
  '',
  'func _process(_delta: float) -> void:',
  '\tcounter += 1',
  '\tvar doubled := counter * 2',
  '\tvar label := "tick %d" % doubled',
  '\tif counter % 60 == 0:',
  '\t\tprint(label)',
  '',
  '',
  'func _physics_process(_delta: float) -> void:',
  '\tif Input.is_action_pressed("jump"):',
  '\t\tcounter += 100',
  '',
].join('\n');

const jumpLine = mainScript.split('\n').indexOf('\t\tcounter += 100') + 1;

const mainScene = ['[gd_scene load_steps=2 format=3]', '', '[ext_resource type="Script" path="res://main.gd" id="1_main"]', '', '[node name="Main" type="Node3D"]', 'script = ExtResource("1_main")', ''].join('\n');

describe.skipIf(godotBinary === '')('debugging the running game with breakpoints', () => {
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
    project = new TemporaryProject('MCP debugging', { mainScene: 'res://main.tscn' });
    project.write('main.gd', mainScript);
    project.write('main.tscn', mainScene);
    const debugAdapterPort = await findFreePort();
    editorProcess = await startHeadlessEditor(project.root, { debugAdapter: debugAdapterPort });
    session = await McpSession.connect(project.root, { GODOT_DAP_PORT: String(debugAdapterPort) });
    await session.call('input_map_set', { actions: { jump: ['Space'] } });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('sets a breakpoint on a line of code and refuses a line the script does not have', async () => {
    const added = await tools().call('debug_breakpoints', { add: ['res://main.gd:10'] });
    const refused = await tools().call('debug_breakpoints', { add: ['res://main.gd:99'] });

    expect(added.text).toBe(
      [
        'Breakpoints:',
        '- res://main.gd:10  var label := "tick %d" % doubled',
        'The game stops at them when it runs from the editor; debug_state shows where it stopped.',
      ].join('\n'),
    );
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe(`res://main.gd has ${String(mainScript.split('\n').length)} lines, so it has no line 99.`);
  });

  it('stops the game at the breakpoint and shows the stack, the code and the variables', async () => {
    const run = await tools().call('game_run');
    const state = await tools().call('debug_state', { wait_ms: 10_000 });

    expect(run.text).toMatch(/^The game is stopped in the debugger in res:\/\/main\.tscn, at a breakpoint or on an error: debug_state shows where and why\./);
    expect(state.text).toMatch(/^The game stopped at a breakpoint at res:\/\/main\.gd:10 in _process\.\nStack:\n- #0 res:\/\/main\.gd:10 in _process\n/);
    expect(state.text).toContain(['Code of #0:', '   8 |     counter += 1', '   9 |     var doubled := counter * 2', '> 10 |     var label := "tick %d" % doubled'].join('\n'));
    expect(state.text).toMatch(/Locals of #0:\n- _delta = [\d.e-]+\n- doubled = 2\n- label = <null>\nMembers of #0:\n- counter = 1\n- speed = 4\.5\n/);
  });

  it('still reads nodes of the stopped game, but does not wait on its frames', async () => {
    const properties = await tools().call('game_get_properties', { path: '.', names: ['counter'] });
    const waited = await tools().call('game_wait', { physics_frames: 5 });

    expect(properties.text).toContain('counter = 1');
    expect(waited.isError).toBe(true);
    expect(waited.text).toBe('The game is stopped in the debugger, so its frames do not advance\nHint: debug_state shows where it stopped; resume it with debug_continue.');
  });

  it('steps over a line, then removes the breakpoint and lets the game run on', async () => {
    const stepped = await tools().call('debug_continue', { action: 'step_over' });
    const removed = await tools().call('debug_breakpoints', { remove: ['res://main.gd:10'] });
    const continued = await tools().call('debug_continue');
    const waited = await tools().call('game_wait', { physics_frames: 10 });
    const state = await tools().call('debug_state');

    expect(stepped.text).toMatch(/^Stepped over to res:\/\/main\.gd:11 in _process:\n/);
    expect(stepped.text).toContain('> 11 |     if counter % 60 == 0:\nLocals of #0:\n');
    expect(stepped.text).toContain('- label = tick 2');
    expect(removed.text).toBe('The project has no breakpoints. Add them with add, such as ["res://player/player.gd:42"].');
    expect(continued.text).toBe('The game continues. debug_state with wait_ms waits for it to stop at the next breakpoint.');
    expect(waited.isError).toBe(false);
    expect(state.text).toMatch(/^The game is not stopped in the debugger\./);
  });

  it('answers at once when the game stops at a breakpoint in the middle of the input', async () => {
    await tools().call('debug_breakpoints', { add: [`res://main.gd:${String(jumpLine)}`] });
    const started = Date.now();
    const played = await tools().call('game_input', { steps: [{ action: 'jump', physics_frames: 30 }] });
    const answeredAfterMs = Date.now() - started;
    const state = await tools().call('debug_state');
    await tools().call('debug_breakpoints', { clear: true });
    await tools().call('debug_continue');

    expect(played.isError).toBe(true);
    expect(played.text).toBe(
      'The game stopped in the debugger before this call finished; its frames do not advance while it is stopped\nHint: debug_state shows where it stopped; debug_continue resumes the game, and the rest of this call plays out then.',
    );
    expect(answeredAfterMs).toBeLessThan(5000);
    expect(state.text).toMatch(new RegExp(`^The game stopped at a breakpoint at res://main\\.gd:${String(jumpLine)} in _physics_process\\.`));
  });
});
