import { checked, conditionHolds, type Scenario } from '../Scenario.js';

const main = 'res://main.tscn';

const jumpingPlayerScript = [
  'extends CharacterBody3D',
  '',
  'const JUMP_VELOCITY := 4.5',
  '',
  'var jumps := 0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tif Input.is_action_just_pressed("jump") and is_on_floor():',
  '\t\tvelocity.y = JUMP_VELOCITY',
  '\t\tjumps += 1',
  '\tmove_and_slide()',
  '',
].join('\n');

export const playtestWithoutAWindow: Scenario = {
  name: 'playtest-without-a-window',
  request: 'Check that the player can jump: pressing Space on the floor makes it jump once and land again.',
  projectOptions: { mainScene: main, withRuntimeAutoload: true },
  editorDuringRun: false,
  serverVariables: { GODOT_MCP_HEADLESS: '1' },
  async prepare({ project, tools }) {
    project.write('player.gd', jumpingPlayerScript);
    await tools.call('editor_rescan');
    await tools.call('input_map_set', { actions: { jump: ['Space'] } });
    await tools.call('scene_create', { path: main, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [10, 1, 10], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'CharacterBody3D', name: 'Player', properties: { position: [0, 0, 0], script: 'res://player.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', parent: 'Player', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
      ],
    });
    await tools.call('scene_save');
  },
  solve() {
    return Promise.resolve();
  },
  async check({ tools, agent }) {
    const run = await tools.call('game_run');
    const checks = [
      checked('the game runs as a process without the editor', /^The game is running res:\/\/main\.tscn/.test(run.text), run.text.split('\n')[0] ?? ''),
      await conditionHolds(tools, 'the player starts on the floor', 'Player', 'is_on_floor()', 5_000),
    ];
    await tools.call('game_input', { steps: [{ key: 'Space' }, { wait_ms: 100 }] });
    checks.push(
      await conditionHolds(tools, 'the player lands after one jump', 'Player', 'is_on_floor() and jumps == 1', 5_000),
    );
    if (agent !== undefined) {
      const called = Object.keys(agent.toolCalls);
      checks.push(
        checked('the agent played the jump in the game', called.some((tool) => tool.endsWith('__game_input')), called.join(', ')),
        checked('the agent did not start an editor', !called.some((tool) => tool.endsWith('__editor_launch')), called.join(', ')),
        checked('the agent says the jump works', /jump/i.test(agent.finalMessage), agent.finalMessage.slice(0, 200)),
      );
    }
    return checks;
  },
};
