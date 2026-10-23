import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { McpSession, TemporaryProject } from '../../integration/harness.js';

export type Operation = Readonly<Record<string, unknown>>;

export const arenaScene = 'res://arena.tscn';
export const playerStart: readonly number[] = [0, 0, 4];

export function playerScript(extraLines: readonly string[] = [], jumpLines: readonly string[] = []): string {
  return [
    'extends CharacterBody3D',
    '',
    'const SPEED := 5.0',
    'const JUMP_VELOCITY := 4.5',
    ...extraLines,
    '',
    '',
    'func _physics_process(delta: float) -> void:',
    '\tif not is_on_floor():',
    '\t\tvelocity += get_gravity() * delta',
    '\tif Input.is_action_just_pressed("jump") and is_on_floor():',
    '\t\tvelocity.y = JUMP_VELOCITY',
    ...jumpLines,
    '\tvar input_direction := Input.get_vector("move_left", "move_right", "move_forward", "move_back")',
    '\tvar direction := (transform.basis * Vector3(input_direction.x, 0, input_direction.y)).normalized()',
    '\tvelocity.x = direction.x * SPEED',
    '\tvelocity.z = direction.z * SPEED',
    '\tmove_and_slide()',
    '',
  ].join('\n');
}

export const keyboardActions = { move_forward: ['W'], move_back: ['S'], move_left: ['A'], move_right: ['D'], jump: ['Space'] };

export function arenaOperations(): Operation[] {
  return [
    { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
    { op: 'node_add', type: 'CSGBox3D', name: 'WallNorth', properties: { size: [22, 3, 1], position: [0, 1.5, -10.5], use_collision: true } },
    { op: 'node_add', type: 'CSGBox3D', name: 'WallSouth', properties: { size: [22, 3, 1], position: [0, 1.5, 10.5], use_collision: true } },
    { op: 'node_add', type: 'CSGBox3D', name: 'WallEast', properties: { size: [1, 3, 20], position: [10.5, 1.5, 0], use_collision: true } },
    { op: 'node_add', type: 'CSGBox3D', name: 'WallWest', properties: { size: [1, 3, 20], position: [-10.5, 1.5, 0], use_collision: true } },
    { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } },
    { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 14, 14], rotation_degrees: [-45, 0, 0] } },
  ];
}

export function playerOperations(scriptPath = 'res://player.gd'): Operation[] {
  return [
    { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: playerStart, script: scriptPath } },
    { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
    { op: 'node_add', type: 'MeshInstance3D', name: 'Body', parent: 'Player', properties: { position: [0, 0.9, 0], mesh: { new: 'CapsuleMesh', radius: 0.4, height: 1.8 } } },
  ];
}

export async function writeScripts(project: TemporaryProject, tools: McpSession, scripts: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, text] of Object.entries(scripts)) {
    mkdirSync(dirname(project.path(path)), { recursive: true });
    project.write(path, text);
  }
  await tools.call('editor_rescan');
}

export async function buildArena(tools: McpSession, operations: readonly Operation[]): Promise<void> {
  await tools.call('scene_create', { path: arenaScene, root_type: 'Node3D' });
  await tools.call('scene_batch_edit', { operations });
  await tools.call('scene_save');
}

export async function buildPrototype(
  project: TemporaryProject,
  tools: McpSession,
  options: { readonly player?: string; readonly scripts?: Readonly<Record<string, string>>; readonly operations?: readonly Operation[] } = {},
): Promise<void> {
  await writeScripts(project, tools, { 'player.gd': options.player ?? playerScript(), ...options.scripts });
  await tools.call('input_map_set', { actions: keyboardActions });
  await buildArena(tools, [...arenaOperations(), ...playerOperations(), ...(options.operations ?? [])]);
}
