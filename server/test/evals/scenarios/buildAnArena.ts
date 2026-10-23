import type { McpSession } from '../../integration/harness.js';
import { agentUsed, checked, conditionHolds, findNodes, type Scenario } from '../Scenario.js';

const main = 'res://main.tscn';

interface Box {
  readonly size: readonly number[];
  readonly from: readonly number[];
}

async function boundsOf(tools: McpSession, path: string): Promise<Box | undefined> {
  const outcome = await tools.call('node_get_bounds', { scene: main, path });
  const size = /size Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/.exec(outcome.text)?.groups;
  const from = /from Vector3\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\)/.exec(outcome.text)?.groups;
  if (size === undefined || from === undefined) {
    return undefined;
  }
  return { size: [Number(size['x']), Number(size['y']), Number(size['z'])], from: [Number(from['x']), Number(from['y']), Number(from['z'])] };
}

export const buildAnArena: Scenario = {
  name: 'build-an-arena',
  request: 'Build a small arena for a 3D prototype in the main scene: a 30 by 30 m floor, walls 3 m high around it, a ramp up to a 2 m high platform in one corner, sunlight with shadows and a sky. Check it from a few angles.',
  window: true,
  projectOptions: { mainScene: main },
  async prepare({ tools }) {
    await tools.call('scene_create', { path: main, root_type: 'Node3D' });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: main,
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [30, 1, 30], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'WallNorth', properties: { size: [32, 3, 1], position: [0, 1.5, -15.5], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'WallSouth', properties: { size: [32, 3, 1], position: [0, 1.5, 15.5], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'WallEast', properties: { size: [1, 3, 30], position: [15.5, 1.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'WallWest', properties: { size: [1, 3, 30], position: [-15.5, 1.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Platform', properties: { size: [6, 2, 6], position: [12, 1, -12], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Ramp', properties: { size: [3, 0.3, 6.4], position: [12, 1, -6.2], rotation_degrees: [-18.4, 0, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0], shadow_enabled: true } },
        {
          op: 'node_add',
          type: 'WorldEnvironment',
          name: 'Environment',
          properties: { environment: { new: 'Environment', background_mode: 'Sky', sky: { new: 'Sky', sky_material: { new: 'ProceduralSkyMaterial' } } } },
        },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 18, 24], rotation_degrees: [-40, 0, 0] } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools, agent }) {
    const scene = await boundsOf(tools, '.');
    const footprint = scene === undefined ? [0, 0] : [scene.size[0] ?? 0, scene.size[2] ?? 0];
    const lights = await findNodes(tools, main, { type: 'DirectionalLight3D' });
    const lightProperties = lights[0] === undefined ? '' : (await tools.call('node_get_properties', { scene: main, path: lights[0], names: ['shadow_enabled'] })).text;
    const shapes = await findNodes(tools, main, { type: 'GeometryInstance3D' });
    const tops = await Promise.all(shapes.map(async (path) => ({ path, box: await boundsOf(tools, path) })));
    const raised = tops.filter(({ box }) => box !== undefined && Math.abs((box.from[1] ?? 0) + (box.size[1] ?? 0) - 2) < 0.35);
    const checks = [
      checked('the arena is about 30 × 30 m with walls around it', footprint.every((side) => side >= 29.5 && side <= 34), JSON.stringify(scene)),
      checked('the walls are about 3 m high', scene !== undefined && (scene.from[1] ?? 0) + (scene.size[1] ?? 0) >= 2.8, JSON.stringify(scene)),
      checked('something reaches 2 m: the platform or the top of the ramp', raised.length > 0, raised.map(({ path }) => path).join(', ') || 'nothing tops out at 2 m'),
      checked('a sun casts shadows', /shadow_enabled = true/.test(lightProperties), lightProperties.split('\n').at(-1) ?? 'no DirectionalLight3D'),
    ];
    await tools.call('game_run');
    checks.push(
      await conditionHolds(
        tools,
        'the world has a sky',
        '.',
        'get_viewport().world_3d.environment != null and get_viewport().world_3d.environment.background_mode == 2',
        3_000,
      ),
      ...agentUsed(agent, ['game_screenshot', 'editor_screenshot'], 'the agent looked at the arena'),
    );
    return checks;
  },
};
