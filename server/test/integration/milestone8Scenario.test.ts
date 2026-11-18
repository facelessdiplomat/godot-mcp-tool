import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, stopDiscoveredEditor } from './harness.js';

const networkTests = process.env['GODOT_MCP_NETWORK_TESTS'] === '1';

const standingCapsule = ['extends CharacterBody3D', '', '', 'func _physics_process(delta: float) -> void:', '\tif not is_on_floor():', '\t\tvelocity += get_gravity() * delta', '\tmove_and_slide()', ''].join('\n');

const walkingCapsule = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 4.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvelocity.x = Input.get_axis("move_left", "move_right") * SPEED',
  '\tmove_and_slide()',
  '',
].join('\n');

const capsuleTest = [
  'extends GutTest',
  '',
  'const CapsuleScene := preload("res://capsule.tscn")',
  '',
  '',
  'func test_walks_right_while_move_right_is_held() -> void:',
  '\tvar capsule: CharacterBody3D = CapsuleScene.instantiate()',
  '\tadd_child_autofree(capsule)',
  '\tInput.action_press("move_right")',
  '\tawait wait_physics_frames(10)',
  '\tInput.action_release("move_right")',
  '\tassert_gt(capsule.position.x, 0.1)',
  '',
].join('\n');

describe.skipIf(godotBinary === '' || !networkTests)('the milestone 8 scenario: a walking capsule and its test, from an empty folder', () => {
  let folder = '';
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  function write(path: string, text: string): void {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), text);
  }

  beforeAll(async () => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-milestone-8-')));
    session = await McpSession.connect(folder, { GODOT_BIN: godotBinary });
  });

  afterAll(async () => {
    await session?.close();
    await stopDiscoveredEditor(folder);
    rmSync(folder, { recursive: true, force: true });
  });

  it(
    'creates the project, installs GUT, sees the test fail first and pass after the capsule walks',
    async () => {
      const created = await tools().call('project_create', { name: 'Capsule Walk' });
      const launched = await tools().call('editor_launch', { headless: true });
      const installed = await tools().call('test_install_framework', { framework: 'gut' });
      await tools().call('input_map_set', { actions: { move_left: ['A'], move_right: ['D'] } });
      write('capsule.gd', standingCapsule);
      await tools().call('editor_rescan');
      await tools().call('scene_create', { path: 'res://capsule.tscn', root_type: 'CharacterBody3D', root_name: 'Capsule' });
      await tools().call('scene_batch_edit', {
        scene: 'res://capsule.tscn',
        operations: [
          { op: 'node_set_properties', path: '.', properties: { script: 'res://capsule.gd' } },
          { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D' } } },
          { op: 'node_add', type: 'MeshInstance3D', name: 'Body', properties: { position: [0, 0.9, 0], mesh: { new: 'CapsuleMesh' } } },
        ],
      });
      await tools().call('scene_save', { scene: 'res://capsule.tscn' });
      await tools().call('scene_batch_edit', {
        scene: 'res://main.tscn',
        operations: [
          { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
          { op: 'node_add', type: 'res://capsule.tscn', name: 'Capsule' },
        ],
      });
      await tools().call('scene_save', { scene: 'res://main.tscn' });
      write('test/test_capsule.gd', capsuleTest);
      await tools().call('editor_rescan');
      const red = await tools().call('test_run', {});
      write('capsule.gd', walkingCapsule);
      await tools().call('editor_rescan');
      const validated = await tools().call('script_validate', { paths: ['res://'] });
      const green = await tools().call('test_run', {});

      expect(created.text).toContain('The server now works on this project');
      expect(launched.isError).toBe(false);
      expect(installed.text).toContain('Installed GUT 9.7.1');
      expect(installed.text).toContain('Turned the plugin gut on in the editor.');
      expect(red.text).toContain('1 failed');
      expect(validated.text).toMatch(/^No problems in \d+ scripts/);
      expect(green.isError).toBe(false);
      expect(green.text).toContain('Ran 1 test in 1 script with GUT');
      expect(green.text).toContain('all passed');
    },
    editorStartupTimeoutMs + 300_000,
  );
});
