import { conditionHolds, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype } from './fixtures.js';

const camera = 'get_viewport().get_camera_3d()';

export const cameraFollow: Scenario = {
  name: 'camera-follow',
  request: 'Make the camera follow the player from behind and above, smoothly, and keep it from going through walls.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools);
  },
  async solve({ tools }) {
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        { op: 'node_add', type: 'SpringArm3D', name: 'CameraArm', parent: 'Player', properties: { position: [0, 1.6, 0], rotation_degrees: [-25, 0, 0], spring_length: 5 } },
        { op: 'node_add', type: 'Camera3D', name: 'FollowCamera', parent: 'Player/CameraArm', properties: { current: true } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const checks = [await scriptsAreClean(tools)];
    await tools.call('game_run');
    await tools.call('game_input', { steps: [{ key: 'W', ms: 1500 }] });
    checks.push(
      await conditionHolds(
        tools,
        'the camera stays behind and above the walking player',
        'Player',
        `${camera}.global_position.y > global_position.y + 1.0 and ${camera}.global_position.distance_to(global_position) > 2.5 and ${camera}.global_position.distance_to(global_position) < 9.0`,
        3_000,
      ),
      await conditionHolds(
        tools,
        'the camera looks at the player',
        'Player',
        `(-${camera}.global_basis.z).dot((global_position + Vector3(0, 1, 0) - ${camera}.global_position).normalized()) > 0.8`,
        3_000,
      ),
    );
    await tools.call('game_set_properties', { path: 'Player', properties: { global_position: [0, 0, 9.2], rotation: [0, 0, 0] } });
    checks.push(await conditionHolds(tools, 'the camera stays inside the arena when the player backs into a wall', 'Player', `${camera}.global_position.z < 10.3`, 3_000));
    return checks;
  },
};
