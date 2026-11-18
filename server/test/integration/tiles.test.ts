import type { ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { editorStartupTimeoutMs, godotBinary, McpSession, startHeadlessEditor, TemporaryProject } from './harness.js';
import { encodeWhitePng } from './pngImage.js';

const tileSize = 32;
const groundRow = 10;
const fallerHalfHeight = 20;

const fallingScript = [
  'extends CharacterBody2D',
  '',
  'const GRAVITY := 980.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tvelocity.y += GRAVITY * delta',
  '\tmove_and_slide()',
  '',
].join('\n');

const levelScene = [
  '[gd_scene load_steps=3 format=3]',
  '',
  '[ext_resource type="Script" path="res://faller.gd" id="1_faller"]',
  '',
  '[sub_resource type="RectangleShape2D" id="RectangleShape2D_body"]',
  'size = Vector2(24, 40)',
  '',
  '[node name="Level" type="Node2D"]',
  '',
  '[node name="Ground" type="TileMapLayer" parent="."]',
  '',
  '[node name="Faller" type="CharacterBody2D" parent="."]',
  'position = Vector2(100, 100)',
  'script = ExtResource("1_faller")',
  '',
  '[node name="Shape" type="CollisionShape2D" parent="Faller"]',
  'shape = SubResource("RectangleShape2D_body")',
  '',
].join('\n');

const position2dPattern = /^position = Vector2\((?<x>[^,]+), (?<y>[^)]+)\)/m;

function heightIn(propertiesText: string): number {
  return Number(position2dPattern.exec(propertiesText)?.groups?.['y']);
}

function editorEnded(editorProcess: ChildProcess): Promise<void> {
  return new Promise((resolveEnd) => {
    editorProcess.once('exit', () => {
      resolveEnd();
    });
    editorProcess.kill('SIGKILL');
  });
}

describe.skipIf(godotBinary === '')('a 2D level of tiles', () => {
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
    project = new TemporaryProject('MCP tiles', { mainScene: 'res://level.tscn' });
    writeFileSync(project.path('tiles.png'), encodeWhitePng(tileSize * 2, tileSize));
    project.write('faller.gd', fallingScript);
    project.write('level.tscn', levelScene);
    editorProcess = await startHeadlessEditor(project.root);
    session = await McpSession.connect(project.root, { GODOT_BIN: godotBinary });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('builds a TileSet with collision from a texture and paints ground that a body lands on', async () => {
    await tools().call('editor_rescan');
    const atlas = await tools().call('tileset_add_atlas', { path: 'res://ground.tres', texture: 'res://tiles.png', tile_size: [tileSize, tileSize], collision: true });
    await tools().call('node_set_properties', { scene: 'res://level.tscn', path: 'Ground', properties: { tile_set: 'res://ground.tres' } });
    const painted = await tools().call('tilemap_set_cells', {
      path: 'Ground',
      rects: [{ from: [0, groundRow], to: [29, groundRow], atlas: [0, 0] }],
      cells: [{ position: [5, groundRow - 1], atlas: [1, 0] }],
    });
    const read = await tools().call('tilemap_get_cells', { path: 'Ground', max_cells: 1 });
    await tools().call('scene_save', { scene: 'res://level.tscn' });
    await tools().call('game_run');
    const landed = await tools().call('game_wait', { node: 'Faller', condition: 'is_on_floor()' });
    const faller = await tools().call('game_get_properties', { path: 'Faller', names: ['position'] });
    await tools().call('game_stop');

    expect(atlas.text).toContain(
      'Created res://ground.tres, a TileSet of 32×32 tiles, with source 0: 2 tiles of res://tiles.png in 2 columns and 1 row. Each tile collides as a full square on physics layer 0.',
    );
    expect(painted.text).toBe('Set 31 cells of Ground in res://level.tscn as one Undo step. It now has 31 cells. The scene has unsaved changes.');
    expect(read.text).toContain('Ground in res://level.tscn is a TileMapLayer with the TileSet res://ground.tres of 32×32 tiles and 1 physics layer.');
    expect(read.text).toContain('Source 0: 2 tiles of res://tiles.png in 2 columns and 1 row, 2 with collision.');
    expect(read.text).toContain('It has 31 cells, from [0, 9] to [29, 10]: tile [0, 0] ×30, tile [1, 0] ×1.');
    expect(landed.isError).toBe(false);
    expect(heightIn(faller.text)).toBeCloseTo(groundRow * tileSize - fallerHalfHeight, 0);
  });

  it('reads the saved tiles without the editor', async () => {
    await tools().close();
    if (editorProcess !== undefined) {
      await editorEnded(editorProcess);
    }
    session = await McpSession.connect(project?.root ?? '', { GODOT_BIN: godotBinary });

    const part = await tools().call('tilemap_get_cells', { scene: 'res://level.tscn', path: 'Ground', from: [0, groundRow - 1], to: [9, groundRow] });

    expect(part.isError).toBe(false);
    expect(part.text).toContain('Between [0, 9] and [9, 10] it has 11 cells: tile [0, 0] ×10, tile [1, 0] ×1.');
  });
});
