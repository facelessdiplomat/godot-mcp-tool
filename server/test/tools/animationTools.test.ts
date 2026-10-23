import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createAnimationDeleteTool, createAnimationGetTool, createAnimationSetTool } from '../../src/tools/animationTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const player = { scene: 'res://level.tscn', player: 'AnimationPlayer', root_node: '..', autoplay: '' };

const doorRising = [
  { path: 'Door:position', keys: [{ time: 0, value: [0, 1, 0] }, { time: 1, value: [0, 4, 0] }] },
];

describe('animation tools', () => {
  it('animation_get lists the animations of a player', async () => {
    const editor = new FakeEditorGateway().respondTo('animation.get', {
      ...player,
      autoplay: 'idle',
      animations: [
        { name: 'idle', length: 2, loop: 'linear', tracks: 3 },
        { name: 'open', length: 1, loop: 'none', tracks: 1 },
      ],
    });

    const result = await createAnimationGetTool(editor).execute({ player: 'AnimationPlayer' });

    expect(editor.requests[0]?.params).toEqual({ player: 'AnimationPlayer' });
    expect(textOf(result)).toBe(
      [
        'AnimationPlayer in res://level.tscn: tracks animate nodes from .., autoplay idle',
        'Animations:',
        '- idle: 2 s, loop linear, 3 tracks',
        '- open: 1 s, loop none, 1 track',
      ].join('\n'),
    );
  });

  it('animation_get shows the tracks and keys of one animation', async () => {
    const editor = new FakeEditorGateway().respondTo('animation.get', {
      ...player,
      animation: {
        name: 'open',
        length: 1,
        loop: 'none',
        tracks: [
          {
            path: 'Door:position',
            type: 'value',
            interpolation: 'linear',
            update: 'continuous',
            key_count: 2,
            keys: [
              { time: 0, value: 'Vector3(0, 1, 0)' },
              { time: 1, value: 'Vector3(0, 4, 0)' },
            ],
          },
          { path: 'Skeleton3D:Hips', type: 'rotation_3d', interpolation: 'linear', key_count: 40, keys: [{ time: 0, value: 'Quaternion(0, 0, 0, 1)' }] },
        ],
      },
    });

    const result = await createAnimationGetTool(editor).execute({ player: 'AnimationPlayer', name: 'open' });

    expect(textOf(result)).toBe(
      [
        'AnimationPlayer in res://level.tscn: tracks animate nodes from .., autoplay none',
        'open: 1 s, loop none',
        '- Door:position (value, linear, continuous): 0 s Vector3(0, 1, 0); 1 s Vector3(0, 4, 0)',
        '- Skeleton3D:Hips (rotation_3d, linear): 0 s Quaternion(0, 0, 0, 1); … 1 of 40 keys shown',
      ].join('\n'),
    );
  });

  it('animation_set reports the tracks it created and the ones it rejected', async () => {
    const editor = new FakeEditorGateway().respondTo('animation.set', {
      scene: 'res://level.tscn',
      player: 'AnimationPlayer',
      name: 'open',
      created: true,
      length: 1,
      loop: 'none',
      tracks: [{ path: 'Door:position', keys: 2, interpolation: 'linear', update: 'continuous', from: 'Vector3(0, 1, 0)', to: 'Vector3(0, 4, 0)' }],
      rejected: [{ path: 'Gate:position', reason: 'there is no node Gate under Level.' }],
    });

    const result = await createAnimationSetTool(editor).execute({ player: 'AnimationPlayer', name: 'open', length: 1, tracks: doorRising });

    expect(editor.requests[0]?.params).toEqual({ player: 'AnimationPlayer', name: 'open', length: 1, tracks: doorRising });
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Created the animation open (1 s, loop none) of AnimationPlayer in res://level.tscn as one Undo step; the scene has unsaved changes.',
        '- Door:position: 2 keys from Vector3(0, 1, 0) to Vector3(0, 4, 0), linear, continuous',
        'Rejected:',
        '- Gate:position: there is no node Gate under Level.',
      ].join('\n'),
    );
  });

  it('animation_set names the properties whose current values it keyed in RESET', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('animation.set', {
        scene: 'res://level.tscn',
        player: 'AnimationPlayer',
        name: 'open',
        created: true,
        length: 1,
        loop: 'none',
        tracks: [{ path: 'Door:position', keys: 2, interpolation: 'linear', update: 'continuous', from: 'Vector3(0, 1, 0)', to: 'Vector3(0, 4, 0)' }],
        rejected: [],
        reset_tracks: ['Door:position'],
      })
      .respondTo('animation.set', {
        scene: 'res://level.tscn',
        player: 'AnimationPlayer',
        name: 'dim',
        created: true,
        length: 1,
        loop: 'none',
        tracks: [{ path: 'Lamp:light_energy', keys: 2, interpolation: 'linear', update: 'continuous', from: 1, to: 0.2 }],
        rejected: [],
        reset_tracks: ['Lamp:light_energy', 'Lamp:light_color'],
      });

    const one = textOf(await createAnimationSetTool(editor).execute({ player: 'AnimationPlayer', name: 'open', length: 1, tracks: doorRising }));
    const two = textOf(await createAnimationSetTool(editor).execute({ player: 'AnimationPlayer', name: 'dim', length: 1, tracks: doorRising }));

    expect(one.split('\n').at(-1)).toBe('Keyed the current value of Door:position in RESET, the pose that the other animations and AnimationTree blends start from.');
    expect(two.split('\n').at(-1)).toBe('Keyed the current values of Lamp:light_energy, Lamp:light_color in RESET, the pose that the other animations and AnimationTree blends start from.');
  });

  it('animation_set says when it replaced an animation and fails when no track could be used', async () => {
    const replaced = new FakeEditorGateway().respondTo('animation.set', {
      scene: 'res://level.tscn',
      player: 'AnimationPlayer',
      name: 'open',
      created: false,
      length: 0.5,
      loop: 'pingpong',
      tracks: [{ path: 'Lamp:visible', keys: 2, interpolation: 'linear', update: 'discrete', from: true, to: false }],
      rejected: [],
    });
    const unusable = new FakeEditorGateway().respondTo('animation.set', {
      scene: 'res://level.tscn',
      player: 'AnimationPlayer',
      name: 'open',
      created: false,
      length: 1,
      loop: 'none',
      tracks: [],
      rejected: [{ path: 'Gate:position', reason: 'there is no node Gate under Level.' }],
    });

    const replacedResult = await createAnimationSetTool(replaced).execute({ player: 'AnimationPlayer', name: 'open', tracks: doorRising });
    const unusableResult = await createAnimationSetTool(unusable).execute({ player: 'AnimationPlayer', name: 'open', tracks: doorRising });

    expect(textOf(replacedResult)).toMatch(/^Replaced the animation open \(0\.5 s, loop pingpong\) of AnimationPlayer/);
    expect(textOf(replacedResult)).toContain('- Lamp:visible: 2 keys from true to false, linear, discrete');
    expect(unusableResult.isError).toBe(true);
    expect(textOf(unusableResult)).toBe(['The animation open was not changed: no track could be used.', 'Rejected:', '- Gate:position: there is no node Gate under Level.'].join('\n'));
  });

  it('animation_delete deletes an animation', async () => {
    const editor = new FakeEditorGateway().respondTo('animation.delete', { scene: 'res://level.tscn', player: 'AnimationPlayer', name: 'open' });

    const result = await createAnimationDeleteTool(editor).execute({ player: 'AnimationPlayer', name: 'open' });

    expect(editor.requests[0]?.params).toEqual({ player: 'AnimationPlayer', name: 'open' });
    expect(textOf(result)).toBe('Deleted the animation open of AnimationPlayer in res://level.tscn as one Undo step; the scene has unsaved changes.');
  });
});
