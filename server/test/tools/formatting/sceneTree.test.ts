import { describe, expect, it } from 'vitest';
import { formatSceneTree, type SceneTreeResult } from '../../../src/tools/formatting/sceneTree.js';

const arena: SceneTreeResult = {
  scene: 'res://levels/arena.tscn',
  unsaved: true,
  node_count: 5,
  truncated: false,
  root: {
    name: 'Arena',
    type: 'Node3D',
    script: 'res://levels/arena.gd',
    child_count: 2,
    children: [
      {
        name: 'Player',
        type: 'CharacterBody3D',
        instance: 'res://player/player.tscn',
        groups: ['player', 'hero'],
        child_count: 2,
        children: [
          { name: 'Mesh', type: 'MeshInstance3D' },
          { name: 'Camera', type: 'Camera3D' },
        ],
      },
      { name: 'HUD', type: 'CanvasLayer' },
    ],
  },
};

describe('formatSceneTree', () => {
  it('draws the tree with annotations', () => {
    expect(formatSceneTree(arena)).toBe(
      [
        'res://levels/arena.tscn (unsaved changes)',
        'Arena: Node3D [script res://levels/arena.gd]',
        '├─ Player: CharacterBody3D [instance res://player/player.tscn] groups=player,hero',
        '│  ├─ Mesh: MeshInstance3D',
        '│  └─ Camera: Camera3D',
        '└─ HUD: CanvasLayer',
      ].join('\n'),
    );
  });

  it('tells how many children are hidden and how to see them', () => {
    const text = formatSceneTree({
      scene: 'res://levels/arena.tscn',
      node_count: 2,
      truncated: true,
      root: { name: 'Arena', type: 'Node3D', child_count: 1, children: [{ name: 'HUD', type: 'CanvasLayer', child_count: 3 }] },
    });

    expect(text).toContain('└─ HUD: CanvasLayer (3 children not shown)');
    expect(text).toContain('max_depth');
  });

  it('counts the children cut off by the node limit', () => {
    const text = formatSceneTree({
      scene: 'res://levels/arena.tscn',
      node_count: 2,
      truncated: true,
      root: { name: 'Arena', type: 'Node3D', child_count: 3, children: [{ name: 'Floor', type: 'CSGBox3D' }] },
    });

    expect(text).toContain(['Arena: Node3D', '├─ Floor: CSGBox3D', '└─ … 2 more children not shown'].join('\n'));
  });

  it('marks built-in scripts', () => {
    const text = formatSceneTree({ scene: 'res://a.tscn', node_count: 1, truncated: false, root: { name: 'A', type: 'Node', script: 'built-in' } });

    expect(text).toContain('A: Node [script built-in]');
  });

  it('omits the unsaved marker for scenes read from disk', () => {
    const text = formatSceneTree({ scene: 'res://props/crate.tscn', node_count: 1, truncated: false, root: { name: 'Crate', type: 'Node3D' } });

    expect(text.split('\n')[0]).toBe('res://props/crate.tscn');
  });
});
