import { existsSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import type { McpSession } from '../../integration/harness.js';
import { type CheckResult, checked, conditionHolds, findNodes, type Scenario } from '../Scenario.js';
import { keyboardActions, writeScripts } from './fixtures.js';

const levelScene = 'res://level.tscn';
const playerScene = 'res://player.tscn';
const tileSize = 32;
const tileCount = 2;
const groundRow = 10;
const groundWidth = 30;
const minimumGroundTiles = 20;
const tileMapDataHeaderBytes = 2;
const tileMapCellBytes = 12;
const readTimeoutMs = 3_000;
const landingTimeoutMs = 4_000;
const walkFrames = 180;
const settleFrames = 30;
const shortestWalkPixels = 300;
const shortestCameraMovePixels = 150;
const vector2Pattern = /Vector2\((?<x>[^,]+), (?<y>[^)]+)\)/;
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const tileMapDataPattern = /tile_map_data = PackedByteArray\((?<values>[^)]*)\)/g;
const grassColor = [96, 160, 72];
const dirtColor = [120, 84, 52];

const playerScript = [
  'extends CharacterBody2D',
  '',
  'const SPEED := 200.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvelocity.x = Input.get_axis("move_left", "move_right") * SPEED',
  '\tmove_and_slide()',
  '',
].join('\n');

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function tilesPng(): Buffer {
  const width = tileSize * tileCount;
  const rows = Array.from({ length: tileSize }, () => {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      row.set([...(x < tileSize ? grassColor : dirtColor), 255], 1 + x * 4);
    }
    return row;
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(tileSize, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  return Buffer.concat([pngSignature, pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.concat(rows))), pngChunk('IEND', Buffer.alloc(0))]);
}

function savedTileCount(sceneText: string): number {
  let tiles = 0;
  for (const match of sceneText.matchAll(tileMapDataPattern)) {
    const values = match.groups?.['values']?.trim() ?? '';
    const bytes = values.startsWith('"') ? Buffer.from(values.slice(1, -1), 'base64') : Buffer.from(values === '' ? [] : values.split(',').map((value) => Number(value.trim())));
    tiles += bytes.length < tileMapDataHeaderBytes ? 0 : Math.floor((bytes.length - tileMapDataHeaderBytes) / tileMapCellBytes);
  }
  return tiles;
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}

async function horizontalPositionOf(tools: McpSession, path: string, property: string): Promise<number | undefined> {
  const outcome = await tools.call('game_get_properties', { path, names: [property] });
  const line = outcome.text.split('\n').find((candidate) => candidate.startsWith(`${property} = `)) ?? '';
  const x = vector2Pattern.exec(line)?.groups?.['x'];
  return x === undefined ? undefined : Number(x);
}

export const aLevelOfTiles: Scenario = {
  name: 'a-level-of-tiles',
  request:
    'Make a 2D level in res://level.tscn and make it the main scene: a TileMapLayer with ground tiles from res://tiles.png, at least 20 tiles wide, that the player from res://player.tscn stands on, and a Camera2D that follows the player.',
  window: true,
  async prepare({ project, tools }) {
    writeFileSync(project.path('tiles.png'), tilesPng());
    await writeScripts(project, tools, { 'player.gd': playerScript });
    await tools.call('input_map_set', { actions: keyboardActions });
    await tools.call('scene_create', { path: playerScene, root_type: 'CharacterBody2D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { script: 'res://player.gd' } },
        { op: 'node_add', type: 'CollisionShape2D', name: 'Shape', properties: { shape: { new: 'RectangleShape2D', size: [24, 40] } } },
        { op: 'node_add', type: 'ColorRect', name: 'Body', properties: { size: [24, 40], position: [-12, -20], color: [0.9, 0.3, 0.2, 1] } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('tileset_add_atlas', { path: 'res://ground.tres', texture: 'res://tiles.png', tile_size: [tileSize, tileSize], collision: true });
    await tools.call('scene_create', { path: levelScene, root_type: 'Node2D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'TileMapLayer', name: 'Ground', properties: { tile_set: 'res://ground.tres' } },
        { op: 'node_add', type: playerScene, name: 'Player', properties: { position: [320, 200] } },
        { op: 'node_add', type: 'Camera2D', name: 'Camera', parent: 'Player' },
      ],
    });
    await tools.call('tilemap_set_cells', { path: 'Ground', rects: [{ from: [0, groundRow], to: [groundWidth - 1, groundRow], atlas: [0, 0] }] });
    await tools.call('scene_save');
    await tools.call('project_settings_set', { values: { 'application/run/main_scene': levelScene } });
  },
  async check({ project, tools }) {
    const run = await tools.call('game_run');
    const layer = (await findNodes(tools, levelScene, { type: 'TileMapLayer' }))[0] ?? 'TileMapLayer';
    const player = (await findNodes(tools, levelScene, { type: 'CharacterBody2D' }))[0] ?? 'Player';
    const camera = (await findNodes(tools, levelScene, { type: 'Camera2D', expand_instances: true }))[0] ?? 'Camera2D';
    const levelFile = levelScene.replace('res://', '');
    const tiles = existsSync(project.path(levelFile)) ? savedTileCount(project.read(levelFile)) : 0;
    const checks: CheckResult[] = [
      checked('the main scene is res://level.tscn', !run.isError && run.text.includes(`running ${levelScene}`), firstLine(run.text)),
      checked('the saved level has at least 20 tiles', tiles >= minimumGroundTiles, `${String(tiles)} tiles in the saved scene`),
      await conditionHolds(tools, 'the running level has at least 20 tiles', layer, `get_used_cells().size() >= ${String(minimumGroundTiles)}`, readTimeoutMs),
      await conditionHolds(tools, 'the player lands on the tiles', player, 'is_on_floor()', landingTimeoutMs),
    ];
    const playerFrom = await horizontalPositionOf(tools, player, 'global_position');
    const cameraFrom = await horizontalPositionOf(tools, camera, 'get_screen_center_position()');
    await tools.call('game_input', { steps: [{ action: 'move_right', physics_frames: walkFrames }, { wait_physics_frames: settleFrames }] });
    const playerTo = await horizontalPositionOf(tools, player, 'global_position');
    const cameraTo = await horizontalPositionOf(tools, camera, 'get_screen_center_position()');
    const walked = playerFrom === undefined || playerTo === undefined ? 0 : playerTo - playerFrom;
    const followed = cameraFrom === undefined || cameraTo === undefined ? 0 : cameraTo - cameraFrom;
    checks.push(
      checked(
        'the camera follows the player',
        walked >= shortestWalkPixels && followed >= shortestCameraMovePixels,
        `walking right for 3 s moved the player ${walked.toFixed(0)} px and the camera ${followed.toFixed(0)} px`,
      ),
    );
    return checks;
  },
};
