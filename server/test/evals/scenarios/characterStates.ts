import { agentUsed, checked, conditionHolds, findNodes, type Scenario, scriptsAreClean } from '../Scenario.js';
import { keyboardActions, writeScripts } from './fixtures.js';

const characterScene = 'res://character.tscn';
const levelScene = 'res://level.tscn';

const characterScript = [
  'extends CharacterBody3D',
  '',
  'const SPEED := 3.0',
  '',
  '',
  'func _physics_process(delta: float) -> void:',
  '\tif not is_on_floor():',
  '\t\tvelocity += get_gravity() * delta',
  '\tvar input_direction := Input.get_vector("move_left", "move_right", "move_forward", "move_back")',
  '\tvelocity.x = input_direction.x * SPEED',
  '\tvelocity.z = input_direction.y * SPEED',
  '\tmove_and_slide()',
  '',
].join('\n');

const characterScriptWithConditions = characterScript.replace(
  '\tmove_and_slide()\n',
  '\tmove_and_slide()\n\tvar moving := Vector2(velocity.x, velocity.z).length() > 0.1\n\t$AnimationTree.set("parameters/conditions/moving", moving)\n\t$AnimationTree.set("parameters/conditions/stopped", not moving)\n',
);

export const characterStates: Scenario = {
  name: 'character-states',
  request: 'The character has idle and walk animations. Make it play idle while it stands and walk while it moves, with a short blend between them.',
  projectOptions: { mainScene: levelScene },
  async prepare({ project, tools }) {
    await writeScripts(project, tools, { 'character.gd': characterScript });
    await tools.call('input_map_set', { actions: keyboardActions });
    await tools.call('scene_create', { path: characterScene, root_type: 'CharacterBody3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_set_properties', path: '.', properties: { script: 'res://character.gd' } },
        { op: 'node_add', type: 'CollisionShape3D', name: 'Shape', properties: { position: [0, 0.9, 0], shape: { new: 'CapsuleShape3D', radius: 0.4, height: 1.8 } } },
        { op: 'node_add', type: 'MeshInstance3D', name: 'Model', properties: { position: [0, 0.9, 0], mesh: { new: 'CapsuleMesh', radius: 0.4, height: 1.8 } } },
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer' },
      ],
    });
    await tools.call('animation_set', { player: 'AnimationPlayer', name: 'idle', loop: 'pingpong', tracks: [{ path: 'Model:scale:y', keys: [{ time: 0, value: 1 }, { time: 1, value: 1.03 }] }] });
    await tools.call('animation_set', {
      player: 'AnimationPlayer',
      name: 'walk',
      loop: 'linear',
      tracks: [{ path: 'Model:rotation_degrees:z', keys: [{ time: 0, value: -4 }, { time: 0.4, value: 4 }, { time: 0.8, value: -4 }] }],
    });
    await tools.call('scene_save');
    await tools.call('scene_create', { path: levelScene, root_type: 'Node3D' });
    await tools.call('scene_batch_edit', {
      operations: [
        { op: 'node_add', type: 'CSGBox3D', name: 'Floor', properties: { size: [20, 1, 20], position: [0, -0.5, 0], use_collision: true } },
        { op: 'node_add', type: 'DirectionalLight3D', name: 'Sun', properties: { rotation_degrees: [-50, 30, 0] } },
        { op: 'node_add', type: 'Camera3D', name: 'Camera', properties: { position: [0, 6, 8], rotation_degrees: [-30, 0, 0] } },
        { op: 'node_add', type: characterScene, name: 'Character' },
      ],
    });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    await writeScripts(project, tools, { 'character.gd': characterScriptWithConditions });
    await tools.call('node_add', { scene: characterScene, type: 'AnimationTree', name: 'AnimationTree' });
    await tools.call('animation_tree_set', {
      scene: characterScene,
      tree: 'AnimationTree',
      player: 'AnimationPlayer',
      states: [
        { name: 'idle', animation: 'idle' },
        { name: 'walk', animation: 'walk' },
      ],
      transitions: [
        { from: 'Start', to: 'idle' },
        { from: 'idle', to: 'walk', condition: 'moving', xfade: 0.2 },
        { from: 'walk', to: 'idle', condition: 'stopped', xfade: 0.2 },
      ],
    });
    await tools.call('scene_save', { scene: characterScene });
  },
  async check({ tools, agent }) {
    const trees = await findNodes(tools, characterScene, { type: 'AnimationTree' });
    const tree = trees[0];
    const checks = [checked('the character has an AnimationTree', tree !== undefined, trees.join(', ') || 'none'), await scriptsAreClean(tools)];
    if (tree === undefined) {
      return checks;
    }
    const playing = (state: string): string => `get("parameters/playback").get_current_node() == "${state}"`;
    await tools.call('game_run');
    checks.push(await conditionHolds(tools, 'it plays idle while the character stands', `Character/${tree}`, playing('idle'), 5_000));
    await tools.call('game_input', { steps: [{ action: 'move_forward', state: 'down' }, { wait_ms: 600 }], release_at_end: false });
    checks.push(await conditionHolds(tools, 'it plays walk while the character moves', `Character/${tree}`, playing('walk'), 3_000));
    await tools.call('game_input', { steps: [{ action: 'move_forward', state: 'up' }, { wait_ms: 600 }] });
    checks.push(
      await conditionHolds(tools, 'it goes back to idle when the character stops', `Character/${tree}`, playing('idle'), 3_000),
      ...agentUsed(agent, ['animation_tree_set'], 'the agent set up the state machine with animation_tree_set'),
    );
    return checks;
  },
};
