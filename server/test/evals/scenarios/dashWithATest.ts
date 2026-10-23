import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TemporaryProject } from '../../integration/harness.js';
import { checked, gameVector, horizontalDistance, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, playerScript, writeScripts } from './fixtures.js';

const playerWithClassName = `class_name Player\n${playerScript()}`;

const dashingPlayer = `class_name Player\n${playerScript(['const DASH_SPEED := 15.0', 'const DASH_DURATION := 0.2', '', 'var _dash_time_left := 0.0'])}`
  .replace('\tvar input_direction', '\tif Input.is_action_just_pressed("dash"):\n\t\tdash()\n\tif _dash_time_left > 0.0:\n\t\t_dash_time_left -= delta\n\t\tmove_and_slide()\n\t\treturn\n\tvar input_direction')
  .concat('\n\nfunc dash() -> void:\n\tvar forward := -global_basis.z\n\tvelocity.x = forward.x * DASH_SPEED\n\tvelocity.z = forward.z * DASH_SPEED\n\t_dash_time_left = DASH_DURATION\n');

const playerTests = [
  'extends GutTest',
  '',
  '',
  'func test_dash_moves_forward_at_dash_speed() -> void:',
  '\tvar player := Player.new()',
  '\tadd_child_autofree(player)',
  '\tplayer.dash()',
  '\tassert_almost_eq(player.velocity.z, -Player.DASH_SPEED, 0.001)',
  '',
].join('\n');

function resourceFiles(project: TemporaryProject, folder = project.root): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.') || entry.name === 'addons') {
      return [];
    }
    const path = join(folder, entry.name);
    return entry.isDirectory() ? resourceFiles(project, path) : entry.name.endsWith('.tres') ? [path] : [];
  });
}

export const dashWithATest: Scenario = {
  name: 'dash-with-a-test',
  request: 'Add a dash action (Shift and gamepad B), create a PhysicsMaterial for ice and lay an icy patch with it in the arena, write a GUT test for Player.dash() and run it.',
  projectOptions: { mainScene: arenaScene, testFramework: 'gut' },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, { player: playerWithClassName });
  },
  async solve({ project, tools }) {
    await tools.call('input_map_set', { actions: { dash: ['Shift', { type: 'joypad_button', button: 'b' }] } });
    await tools.call('resource_create', { path: 'res://materials/ice.tres', type: 'PhysicsMaterial', properties: { friction: 0.05 } });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'StaticBody3D', name: 'IcePatch', properties: { position: [6, 0.05, 0], physics_material_override: 'res://materials/ice.tres' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'IcePatch', properties: { shape: { new: 'BoxShape3D', size: [4, 0.1, 4] } } },
      ],
    });
    await tools.call('scene_save');
    await writeScripts(project, tools, { 'player.gd': dashingPlayer, 'test/test_player.gd': playerTests });
  },
  async check({ project, tools }) {
    const inputMap = await tools.call('input_map_get', {});
    const dashLine = inputMap.text.split('\n').find((line) => line.trim().startsWith('dash:')) ?? '';
    const iceMaterials = resourceFiles(project).filter((file) => {
      const text = readFileSync(file, 'utf8');
      const friction = /friction = (?<value>[\d.]+)/.exec(text)?.groups?.['value'];
      return text.includes('type="PhysicsMaterial"') && friction !== undefined && Number(friction) < 0.3;
    });
    const arenaText = project.read('arena.tscn');
    const tests = await tools.call('test_run', {});
    const checks = [
      checked('dash has Shift and the B button', /Shift/.test(dashLine) && /joypad|button/i.test(dashLine), dashLine.trim() || 'no dash action'),
      checked('an ice PhysicsMaterial has a low friction', iceMaterials.length > 0, iceMaterials.join(', ') || 'none'),
      checked('the arena uses the ice material', arenaText.includes('physics_material_override'), 'physics_material_override in arena.tscn'),
      checked('the GUT tests run and pass', /all passed/.test(tests.text), tests.text.split('\n')[0] ?? ''),
      await scriptsAreClean(tools),
    ];
    await tools.call('game_run');
    await tools.call('game_wait', { physics_frames: 30 });
    const start = await gameVector(tools, 'Player', 'global_position');
    await tools.call('game_input', { steps: [{ key: 'Shift' }, { wait_physics_frames: 15 }] });
    const after = await gameVector(tools, 'Player', 'global_position');
    const distance = start === undefined || after === undefined ? 0 : horizontalDistance(start, after);
    checks.push(checked('Shift dashes the player forward fast', distance > 1.5, `${distance.toFixed(2)} m in 0.25 s`));
    return checks;
  },
};
