import { checked, conditionHolds, type Scenario } from '../Scenario.js';

const level = 'res://level.tscn';

export const animateADoor: Scenario = {
  name: 'animate-a-door',
  request: 'Make the door open when the game starts: it slides up 3 m in one second and stays open.',
  projectOptions: { mainScene: level },
  async prepare({ tools }) {
    await tools.call('scene_create', { path: level, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [10, 1, 10], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CSGBox3D', name: 'Door', properties: { size: [2, 3, 0.2], position: [0, 1.5, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 3, 8] } },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ tools }) {
    await tools.call('node_add', { scene: level, type: 'AnimationPlayer', name: 'AnimationPlayer' });
    await tools.call('animation_set', {
      scene: level,
      player: 'AnimationPlayer',
      name: 'open',
      length: 1,
      tracks: [{ path: 'Door:position', keys: [{ time: 0, value: [0, 1.5, 0] }, { time: 1, value: [0, 4.5, 0] }] }],
    });
    await tools.call('node_set_properties', { scene: level, path: 'AnimationPlayer', properties: { autoplay: 'open' } });
    await tools.call('scene_save');
  },
  async check({ tools }) {
    const players = await tools.call('node_find', { scene: level, type: 'AnimationPlayer' });
    const player = /^(?<path>[^:]+): AnimationPlayer/m.exec(players.text.split('\n').slice(1).join('\n'))?.groups?.['path'];
    const animations = player === undefined ? undefined : await tools.call('animation_get', { scene: level, player });
    const checks = [
      checked('the level has an AnimationPlayer that plays an animation on start', animations !== undefined && !/autoplay none/.test(animations.text), animations?.text.split('\n')[0] ?? 'no AnimationPlayer'),
    ];
    await tools.call('game_run');
    checks.push(await conditionHolds(tools, 'the door slides up 3 m', 'Door', 'position.y > 4.4', 3_000));
    await tools.call('game_wait', { physics_frames: 120 });
    checks.push(await conditionHolds(tools, 'the door stays open', 'Door', 'position.y > 4.4', 1_000));
    return checks;
  },
};
