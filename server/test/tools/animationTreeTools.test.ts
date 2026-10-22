import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createAnimationTreeGetTool, createAnimationTreeSetTool } from '../../src/tools/animationTreeTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const walkingStates = [
  { name: 'idle', animation: 'idle' },
  { name: 'walk', animation: 'walk' },
];

const walkingTransitions = [
  { from: 'Start', to: 'idle', advance: 'auto', switch: 'immediate', xfade: 0 },
  { from: 'idle', to: 'walk', advance: 'auto', switch: 'immediate', xfade: 0.2, condition: 'moving' },
  { from: 'walk', to: 'jump', advance: 'enabled', switch: 'at_end', xfade: 0, priority: 0 },
  { from: 'walk', to: 'idle', advance: 'auto', switch: 'immediate', xfade: 0.2, expression: 'velocity.length() < 0.1' },
];

describe('animation tree tools', () => {
  it('animation_tree_get shows the states, the transitions and the conditions of a state machine', async () => {
    const editor = new FakeEditorGateway().respondTo('animation_tree.get', {
      scene: 'res://level.tscn',
      tree: 'Character/AnimationTree',
      player: 'Character/AnimationPlayer',
      active: true,
      expression_base: '..',
      root: 'AnimationNodeStateMachine',
      states: walkingStates,
      transitions: walkingTransitions,
      conditions: ['moving'],
    });

    const result = await createAnimationTreeGetTool(editor).execute({ tree: 'Character/AnimationTree' });

    expect(editor.requests[0]?.params).toEqual({ tree: 'Character/AnimationTree' });
    expect(textOf(result)).toBe(
      [
        'Character/AnimationTree in res://level.tscn: animations from Character/AnimationPlayer, active, expressions run on ..',
        'States: idle (animation idle), walk (animation walk)',
        'Transitions:',
        '- Start -> idle: auto, immediate',
        '- idle -> walk: auto when moving, immediate, xfade 0.2 s',
        '- walk -> jump: enabled, at_end, priority 0',
        '- walk -> idle: auto when velocity.length() < 0.1, immediate, xfade 0.2 s',
        'Conditions: moving, set as parameters/conditions/<name>',
      ].join('\n'),
    );
  });

  it('animation_tree_get says when a tree has no root yet', async () => {
    const editor = new FakeEditorGateway().respondTo('animation_tree.get', {
      scene: 'res://level.tscn',
      tree: 'AnimationTree',
      player: '',
      active: false,
      expression_base: '.',
      root: '',
    });

    const result = await createAnimationTreeGetTool(editor).execute({ tree: 'AnimationTree' });

    expect(textOf(result)).toBe(
      ['AnimationTree in res://level.tscn: no AnimationPlayer yet, inactive, expressions run on .', 'No tree root yet; set up a state machine with animation_tree_set.'].join('\n'),
    );
  });

  it('animation_tree_set reports the state machine, its warnings and what it rejected', async () => {
    const editor = new FakeEditorGateway().respondTo('animation_tree.set', {
      scene: 'res://level.tscn',
      tree: 'Character/AnimationTree',
      player: 'Character/AnimationPlayer',
      states: walkingStates,
      transitions: walkingTransitions.slice(1, 2),
      rejected: [{ item: 'run', reason: 'AnimationPlayer has no animation "sprint". Similar: walk.' }],
      warnings: ['no transition leaves Start'],
    });
    const request = {
      tree: 'Character/AnimationTree',
      player: 'Character/AnimationPlayer',
      states: [...walkingStates, { name: 'run', animation: 'sprint' }],
      transitions: [{ from: 'idle', to: 'walk', condition: 'moving', xfade: 0.2 }],
    };

    const result = await createAnimationTreeSetTool(editor).execute(request);

    expect(editor.requests[0]?.params).toEqual(request);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Set up the state machine of Character/AnimationTree in res://level.tscn with animations from Character/AnimationPlayer as one Undo step; the scene has unsaved changes.',
        'States: idle (animation idle), walk (animation walk)',
        'Transitions:',
        '- idle -> walk: auto when moving, immediate, xfade 0.2 s',
        'Warning: no transition leaves Start',
        'Rejected:',
        '- run: AnimationPlayer has no animation "sprint". Similar: walk.',
      ].join('\n'),
    );
  });

  it('animation_tree_set fails when no state could be used', async () => {
    const editor = new FakeEditorGateway().respondTo('animation_tree.set', {
      scene: 'res://level.tscn',
      tree: 'AnimationTree',
      player: 'AnimationPlayer',
      states: [],
      transitions: [],
      rejected: [{ item: 'run', reason: 'AnimationPlayer has no animation "sprint".' }],
      warnings: [],
    });

    const result = await createAnimationTreeSetTool(editor).execute({ tree: 'AnimationTree', states: [{ name: 'run', animation: 'sprint' }] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(['The state machine of AnimationTree was not set up: no state could be used.', 'Rejected:', '- run: AnimationPlayer has no animation "sprint".'].join('\n'));
  });
});
