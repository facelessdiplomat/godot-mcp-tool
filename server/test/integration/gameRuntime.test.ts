import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const delayedErrorScript = [
  'extends Node',
  '',
  '',
  'func _ready() -> void:',
  '\tprint("Arena loaded")',
  '\tawait get_tree().create_timer(2.0).timeout',
  '\tvar missing: Node = null',
  '\tmissing.queue_free()',
  '',
].join('\n');

const sceneUsing = (scriptPath: string, rootName: string): string =>
  [
    '[gd_scene load_steps=2 format=3]',
    '',
    `[ext_resource type="Script" path="${scriptPath}" id="1_script"]`,
    '',
    `[node name="${rootName}" type="Node"]`,
    'script = ExtResource("1_script")',
    '',
  ].join('\n');

const optionsScript = [
  'extends Node',
  '',
  '',
  'func _ready() -> void:',
  '\tprint("collisions=%s navigation=%s arguments=%s locale=%s" % [get_tree().debug_collisions_hint, get_tree().debug_navigation_hint, OS.get_cmdline_user_args(), TranslationServer.get_locale()])',
  '',
].join('\n');

const signalScript = [
  'extends Node',
  '',
  'signal finished(code: int)',
  '',
  '',
  'func _ready() -> void:',
  '\tawait get_tree().create_timer(2.5).timeout',
  '\tfinished.emit(5)',
  '',
].join('\n');

async function pause(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

describe.skipIf(godotBinary === '')('running the game from the editor', () => {
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
    project = new TemporaryProject('MCP runtime');
    project.write('main.gd', delayedErrorScript);
    project.write('main.tscn', sceneUsing('res://main.gd', 'Main'));
    project.write('broken.gd', 'extends Node\n\nfunc _ready() -> void\n\tprint("never")\n');
    project.write('broken.tscn', sceneUsing('res://broken.gd', 'Broken'));
    project.write('options.gd', optionsScript);
    project.write('signals.gd', signalScript);
    project.write('signals.tscn', sceneUsing('res://signals.gd', 'Signals'));
    project.write('options.tscn', sceneUsing('res://options.gd', 'Options'));
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root);
  }, editorStartupTimeoutMs + 30_000);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('runs a scene right after the editor starts and shows its first output', async () => {
    const run = await tools().call('game_run', { scene: 'res://main.tscn' });

    expect(run.isError).toBe(false);
    expect(run.text).toMatch(/^The game is running res:\/\/main\.tscn; it was ready after \d+ ms\./);
    expect(run.text).toContain('Output:\nArena loaded');
  });

  it('reports a later script error in the next response of any tool', async () => {
    await pause(2_500);

    const result = await tools().call('project_info');

    expect(result.text).toMatch(/\n\n⚠ New error since the last call:\n- in the game: res:\/\/main\.gd:8: .*queue_free.*\nRead the game output with game_get_output\.$/);
  });

  it('shows the error with its location and stack', async () => {
    const output = await tools().call('game_get_output', { levels: ['error'], from_start: true });

    expect(output.text).toContain('The game is running.');
    expect(output.text).toMatch(/ERROR res:\/\/main\.gd:8 in _ready: .*queue_free/);
  });

  it('stops the game', async () => {
    const stopped = await tools().call('game_stop');
    const again = await tools().call('game_stop');

    expect(stopped.text).toBe('Stopped the game.');
    expect(again.text).toBe('The game was not running.');
  });

  it('runs the main scene for a while and stops it', async () => {
    await tools().call('project_settings_set', { values: { 'application/run/main_scene': 'res://main.tscn' } });

    const run = await tools().call('game_run', { duration_ms: 500 });

    expect(run.text).toMatch(/^The game ran res:\/\/main\.tscn for 500 ms after it was ready and was stopped\./);
    expect(run.text).toContain('Arena loaded');
    expect(run.text).not.toContain('queue_free');
  });

  it('passes debug drawing, game arguments and the locale to the game', async () => {
    const run = await tools().call('game_run', {
      scene: 'res://options.tscn',
      duration_ms: 500,
      debug_draw: ['collisions', 'navigation'],
      arguments: ['--level=3'],
      locale: 'de',
    });

    expect(run.text).toContain('collisions=true navigation=true');
    expect(run.text).toContain('--level=3');
    expect(run.text).toContain('locale=de');
  });

  it('waits for a signal of the running game and shows its arguments', async () => {
    await tools().call('game_run', { scene: 'res://signals.tscn' });

    const waited = await tools().call('game_wait', { signal: 'finished', timeout_ms: 5000 });

    expect(waited.text).toMatch(/^The scene root emitted finished after \d+ ms \(\d+ physics frames\) with \[5\]\./);
  });

  it('shows why a scene with a broken script misbehaves', async () => {
    const run = await tools().call('game_run', { scene: 'res://broken.tscn', duration_ms: 300 });

    expect(run.text).toContain('res://broken.gd');
  });
});
