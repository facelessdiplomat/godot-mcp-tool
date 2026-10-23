import { agentUsed, checked, conditionHolds, findNodes, gameVector, horizontalDistance, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaOperations, arenaScene, buildArena, keyboardActions, playerOperations, playerScript, writeScripts } from './fixtures.js';

export const thirdPersonPrototype: Scenario = {
  name: 'third-person-prototype',
  request: 'Make a third-person prototype in the arena: a player that walks with WASD and jumps on Space, with a camera following from behind. Make sure it works.',
  projectOptions: { mainScene: arenaScene },
  async prepare({ tools }) {
    await buildArena(tools, arenaOperations());
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'player.gd': playerScript() });
    await tools.call('input_map_set', { actions: keyboardActions });
    await tools.call('scene_batch_edit', {
      scene: arenaScene,
      operations: [
        ...playerOperations(),
        { op: 'node_add', type: 'SpringArm3D', name: 'CameraArm', parent: 'Player', properties: { position: [0, 1.6, 0], rotation_degrees: [-20, 0, 0], spring_length: 4 } },
        { op: 'node_add', type: 'Camera3D', name: 'FollowCamera', parent: 'Player/CameraArm', properties: { current: true } },
      ],
    });
    await tools.call('scene_save');
  },
  async check({ tools, agent }) {
    const players = await findNodes(tools, arenaScene, { type: 'CharacterBody3D' });
    const player = players[0];
    const checks = [checked('the arena has one player body', players.length === 1, players.join(', ') || 'no CharacterBody3D'), await scriptsAreClean(tools)];
    if (player === undefined) {
      return checks;
    }
    await tools.call('game_run');
    checks.push(await conditionHolds(tools, 'the player stands on the floor', player, 'is_on_floor()', 5_000));
    const start = await gameVector(tools, player, 'global_position');
    await tools.call('game_input', { steps: [{ key: 'W', ms: 1000 }] });
    const walked = await gameVector(tools, player, 'global_position');
    const distance = start === undefined || walked === undefined ? 0 : horizontalDistance(start, walked);
    checks.push(checked('W moves the player', distance > 2, `${distance.toFixed(2)} m in 1 s`));
    await tools.call('game_input', { steps: [{ key: 'Space' }, { wait_ms: 150 }] });
    const inTheAir = await tools.call('game_get_properties', { path: player, names: ['is_on_floor()'] });
    checks.push(
      checked('Space makes the player jump', /is_on_floor\(\) = false/.test(inTheAir.text), inTheAir.text.split('\n').at(-1) ?? ''),
      await conditionHolds(tools, 'the player lands again', player, 'is_on_floor()', 5_000),
      await conditionHolds(tools, 'a camera follows the player closely', player, 'get_viewport().get_camera_3d().global_position.distance_to(global_position) < 8.0', 3_000),
      ...agentUsed(agent, ['game_input', 'game_wait', 'game_get_properties'], 'the agent tried the controls in the running game'),
    );
    return checks;
  },
};
