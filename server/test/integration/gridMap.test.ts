import type { ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';

const blocksLibrary = [
  '[gd_resource type="MeshLibrary" load_steps=3 format=3]',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_floor"]',
  'size = Vector3(2, 0.2, 2)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_wall"]',
  'size = Vector3(2, 2, 2)',
  '',
  '[resource]',
  'item/0/name = "Floor"',
  'item/0/mesh = SubResource("BoxMesh_floor")',
  'item/1/name = "Wall"',
  'item/1/mesh = SubResource("BoxMesh_wall")',
  '',
].join('\n');

const courtyardScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[ext_resource type="MeshLibrary" path="res://blocks.tres" id="1_blocks"]',
  '',
  '[node name="Courtyard" type="Node3D"]',
  '',
  '[node name="Ground" type="GridMap" parent="."]',
  'mesh_library = ExtResource("1_blocks")',
  '',
].join('\n');

const courtyard = {
  scene: 'res://courtyard.tscn',
  path: 'Ground',
  boxes: [
    { from: [-5, 0, -5], to: [4, 0, 4], item: 'Wall' },
    { from: [-4, 0, -4], to: [3, 0, 3], item: 'Floor' },
  ],
};

function blocksScene(names: readonly string[]): string {
  const sizes: Readonly<Record<string, string>> = { Grass: 'Vector3(2, 0.5, 2)', Stone: 'Vector3(2, 2, 2)', Lava: 'Vector3(2, 0.3, 2)' };
  const resources = names.flatMap((name) => [
    `[sub_resource type="BoxMesh" id="BoxMesh_${name}"]`,
    `size = ${sizes[name] ?? 'Vector3(2, 2, 2)'}`,
    '',
    `[sub_resource type="BoxShape3D" id="BoxShape3D_${name}"]`,
    `size = ${sizes[name] ?? 'Vector3(2, 2, 2)'}`,
    '',
  ]);
  const nodes = names.flatMap((name, index) => [
    `[node name="${name}" type="MeshInstance3D" parent="."]`,
    `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${String(index * 4)}, 0, 0)`,
    `mesh = SubResource("BoxMesh_${name}")`,
    '',
    `[node name="Body" type="StaticBody3D" parent="${name}"]`,
    '',
    `[node name="Shape" type="CollisionShape3D" parent="${name}/Body"]`,
    `shape = SubResource("BoxShape3D_${name}")`,
    '',
  ]);
  return [`[gd_scene load_steps=${String(names.length * 2 + 1)} format=3]`, '', ...resources, '[node name="Blocks" type="Node3D"]', '', ...nodes].join('\n');
}

const yardScene = [
  '[gd_scene load_steps=2 format=3]',
  '',
  '[sub_resource type="SphereShape3D" id="SphereShape3D_ball"]',
  'radius = 0.5',
  '',
  '[node name="Yard" type="Node3D"]',
  '',
  '[node name="Ground" type="GridMap" parent="."]',
  '',
  '[node name="Ball" type="RigidBody3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 3, 4, 3)',
  '',
  '[node name="Shape" type="CollisionShape3D" parent="Ball"]',
  'shape = SubResource("SphereShape3D_ball")',
  '',
].join('\n');

function editorEnded(editorProcess: ChildProcess): Promise<void> {
  return new Promise((resolveEnd) => {
    editorProcess.once('exit', () => {
      resolveEnd();
    });
    editorProcess.kill('SIGKILL');
  });
}

describe.skipIf(godotBinary === '')('painting the cells of a GridMap', () => {
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
    project = new TemporaryProject('MCP grid map', { mainScene: 'res://courtyard.tscn' });
    project.write('blocks.tres', blocksLibrary);
    project.write('courtyard.tscn', courtyardScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('paints a floor inside a ring of walls as one Undo step', async () => {
    const painted = await tools().call('gridmap_set_cells', courtyard);
    const read = await tools().call('gridmap_get_cells', { path: 'Ground', max_cells: 2 });
    await tools().call('editor_undo');
    const undone = await tools().call('gridmap_get_cells', { path: 'Ground' });
    await tools().call('editor_redo');

    expect(painted.text).toBe('Set 100 cells of Ground in res://courtyard.tscn as one Undo step. It now has 100 cells. The scene has unsaved changes.');
    expect(read.text).toContain('Ground in res://courtyard.tscn is a GridMap with the blocks of res://blocks.tres: Floor (0), Wall (1).');
    expect(read.text).toContain('It has 100 cells, from [-5, 0, -5] to [4, 0, 4]: Floor 64, Wall 36.');
    expect(read.text).toContain('- [-5, 0, -5] Wall\n- [-4, 0, -5] Wall\nOnly the first 2 of 100 cells are listed');
    expect(undone.text).toContain('It has no cells.');
  });

  it('builds a library from a scene of blocks that a GridMap paints and a ball lands on, and keeps its ids on an update', async () => {
    mkdirSync(project?.path('blocks') ?? '', { recursive: true });
    project?.write('blocks/blocks.tscn', blocksScene(['Grass', 'Stone']));
    project?.write('yard.tscn', yardScene);
    await tools().call('editor_rescan');

    const created = await tools().call('meshlibrary_create', { scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres' });
    await tools().call('scene_batch_edit', { scene: 'res://yard.tscn', operations: [{ op: 'node_set_properties', path: 'Ground', properties: { mesh_library: 'res://blocks/blocks.tres' } }] });
    await tools().call('gridmap_set_cells', { scene: 'res://yard.tscn', path: 'Ground', boxes: [{ from: [0, 0, 0], to: [3, 0, 3], item: 'Grass' }] });
    await tools().call('scene_save', { scene: 'res://yard.tscn' });
    await tools().call('game_run', { scene: 'res://yard.tscn' });
    const landed = await tools().call('game_wait', { node: 'Ball', condition: 'global_position.y > 1.0 and linear_velocity.length() < 0.05', timeout_ms: 10_000 });
    await tools().call('game_stop');
    project?.write('blocks/blocks.tscn', blocksScene(['Lava', 'Grass', 'Stone']));
    await tools().call('editor_rescan');
    const refused = await tools().call('meshlibrary_create', { scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres' });
    const updated = await tools().call('meshlibrary_create', { scene: 'res://blocks/blocks.tscn', path: 'res://blocks/blocks.tres', update: true });
    const cells = await tools().call('gridmap_get_cells', { scene: 'res://yard.tscn', path: 'Ground', max_cells: 1 });

    expect(created.text).toContain('Created res://blocks/blocks.tres from res://blocks/blocks.tscn with 2 blocks:\n- Grass (0): BoxMesh, 1 collision shape\n- Stone (1): BoxMesh, 1 collision shape');
    expect(landed.text).toMatch(/became true on Ball/);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('res://blocks/blocks.tres already exists');
    expect(updated.text).toContain('Updated res://blocks/blocks.tres from res://blocks/blocks.tscn: 1 new block, 2 kept their ids.');
    expect(updated.text).toContain('- Lava (2, new): BoxMesh, 1 collision shape');
    expect(cells.text).toContain('Grass 16');
  });

  it('reads the saved cells without the editor', async () => {
    await tools().call('scene_save', { scene: 'res://courtyard.tscn' });
    await tools().close();
    if (editorProcess !== undefined) {
      await editorEnded(editorProcess);
    }
    session = await McpSession.connect(project?.root ?? '', { GODOT_BIN: godotBinary });

    const column = await tools().call('gridmap_get_cells', { scene: 'res://courtyard.tscn', path: 'Ground', from: [-4, 0, -5], to: [-4, 0, 4] });

    expect(column.isError).toBe(false);
    expect(column.text).toContain('Between [-4, 0, -5] and [-4, 0, 4] it has 10 cells: Floor 8, Wall 2.');
  });
});
