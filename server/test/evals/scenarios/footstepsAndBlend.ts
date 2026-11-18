import type { McpSession } from '../../integration/harness.js';
import { agentUsed, type CheckResult, checked, type Scenario, scriptsAreClean } from '../Scenario.js';
import { arenaScene, buildPrototype, playerScript, writeScripts } from './fixtures.js';

const footstepLines = ['', 'var steps := 0'];
const footstepHandler = ['', '', 'func _on_footstep() -> void:', '\tsteps += 1', ''];
const blendLine = '\t$AnimationTree.set("parameters/move/blend_position", Vector2(velocity.x, velocity.z).length())';

function walkerScript(blends: boolean): string {
  const lines = playerScript(footstepLines).trimEnd().split('\n');
  return [...lines, ...(blends ? [blendLine] : []), ...footstepHandler].join('\n');
}

const bodyBob = (top: number, length: number): Readonly<Record<string, unknown>> => ({
  path: 'Body:position:y',
  keys: [
    { time: 0, value: 0.9 },
    { time: length / 2, value: top },
    { time: length, value: 0.9 },
  ],
});

async function blendParameter(tools: McpSession): Promise<string | undefined> {
  const tree = await tools.call('animation_tree_get', { scene: arenaScene, tree: 'Player/AnimationTree' });
  return /by (?<parameter>parameters\/\S+\/blend_position)/.exec(tree.text)?.groups?.['parameter'] ?? (tree.text.includes('AnimationNodeBlendSpace') ? 'parameters/blend_position' : undefined);
}

async function blendValue(tools: McpSession, parameter: string): Promise<number | undefined> {
  const read = await tools.call('game_get_properties', { path: 'Player/AnimationTree', names: [parameter] });
  const value = new RegExp(`${parameter.replaceAll('/', '\\/')} = (?<value>-?[\\d.e-]+)`).exec(read.text)?.groups?.['value'];
  return value === undefined ? undefined : Number(value);
}

export const footstepsAndBlend: Scenario = {
  name: 'footsteps-and-blend',
  request: "Call _on_footstep twice in every walk cycle, and blend walking and running by the player's speed.",
  projectOptions: { mainScene: arenaScene },
  async prepare({ project, tools }) {
    await buildPrototype(project, tools, {
      player: walkerScript(false),
      operations: [
        { op: 'node_add', type: 'AnimationPlayer', name: 'AnimationPlayer', parent: 'Player' },
        { op: 'node_add', type: 'AnimationTree', name: 'AnimationTree', parent: 'Player' },
      ],
    });
    await tools.call('animation_set', { scene: arenaScene, player: 'Player/AnimationPlayer', name: 'walk', length: 1, loop: 'linear', tracks: [bodyBob(1, 1)] });
    await tools.call('animation_set', { scene: arenaScene, player: 'Player/AnimationPlayer', name: 'run', length: 0.5, loop: 'linear', tracks: [bodyBob(1.1, 0.5)] });
    await tools.call('scene_save');
  },
  async solve({ project, tools }) {
    await tools.call('animation_set', {
      scene: arenaScene,
      player: 'Player/AnimationPlayer',
      name: 'walk',
      length: 1,
      loop: 'linear',
      tracks: [bodyBob(1, 1), { type: 'method', path: '.', keys: [{ time: 0.25, method: '_on_footstep' }, { time: 0.75, method: '_on_footstep' }] }],
    });
    await tools.call('animation_tree_set', {
      scene: arenaScene,
      tree: 'Player/AnimationTree',
      player: 'Player/AnimationPlayer',
      states: [{ name: 'move', blend: [{ animation: 'walk', at: 0 }, { animation: 'run', at: 5 }] }],
      transitions: [{ from: 'Start', to: 'move' }],
    });
    await writeScripts(project, tools, { 'player.gd': walkerScript(true) });
    await tools.call('scene_save');
  },
  async check({ tools, agent }) {
    const checks: CheckResult[] = [await scriptsAreClean(tools)];
    const walk = await tools.call('animation_get', { scene: arenaScene, player: 'Player/AnimationPlayer', name: 'walk' });
    const footsteps = (walk.text.match(/_on_footstep\(/g) ?? []).length;
    checks.push(checked('the walk cycle calls _on_footstep twice', footsteps === 2, `${String(footsteps)} calls of _on_footstep in walk`));
    const parameter = await blendParameter(tools);
    checks.push(checked('the animation tree blends animations by a parameter', parameter !== undefined, parameter ?? 'no blend state or blend space'));
    if (parameter !== undefined) {
      await tools.call('game_run');
      await tools.call('game_wait', { physics_frames: 30 });
      const atRest = await blendValue(tools, parameter);
      await tools.call('game_input', { steps: [{ action: 'move_right', state: 'down' }, { wait_physics_frames: 30 }], release_at_end: false });
      const moving = await blendValue(tools, parameter);
      await tools.call('game_input', { steps: [{ action: 'move_right', state: 'up' }] });
      checks.push(
        checked(
          'the blend position follows the speed of the player',
          atRest !== undefined && moving !== undefined && moving > atRest + 0.5,
          `${parameter} is ${String(atRest)} at rest and ${String(moving)} while moving`,
        ),
      );
    }
    checks.push(...agentUsed(agent, ['animation_set', 'animation_tree_set'], 'the agent built the animations with the animation tools'));
    return checks;
  },
};
