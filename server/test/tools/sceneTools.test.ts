import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createSceneCloseTool, createSceneCreateTool, createSceneGetTreeTool, createSceneOpenTool, createSceneSaveTool } from '../../src/tools/sceneTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('scene tools', () => {
  it('scene_get_tree asks for the tree with default limits and draws it', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.get_tree', {
      scene: 'res://levels/arena.tscn',
      node_count: 1,
      truncated: false,
      root: { name: 'Arena', type: 'Node3D' },
    });

    const result = await createSceneGetTreeTool(editor).execute({});

    expect(editor.requests[0]?.params).toEqual({ max_depth: 8, max_nodes: 200 });
    expect(textOf(result)).toBe('res://levels/arena.tscn\nArena: Node3D');
  });

  it('scene_get_tree passes the scene and limits through', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.get_tree', {
      scene: 'res://props/crate.tscn',
      node_count: 1,
      truncated: false,
      root: { name: 'Crate', type: 'Node3D' },
    });

    await createSceneGetTreeTool(editor).execute({ scene: 'res://props/crate.tscn', max_depth: 2, max_nodes: 50 });

    expect(editor.requests[0]?.params).toEqual({ scene: 'res://props/crate.tscn', max_depth: 2, max_nodes: 50 });
  });

  it('scene_create reports the new scene', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.create', { scene: 'res://levels/arena.tscn', root: { name: 'Arena', type: 'Node3D' } });

    const result = await createSceneCreateTool(editor).execute({ path: 'res://levels/arena.tscn', root_type: 'Node3D' });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://levels/arena.tscn', root_type: 'Node3D' });
    expect(textOf(result)).toBe('Created res://levels/arena.tscn with the root Arena (Node3D) and opened it in the editor. It is saved; later changes need scene_save.');
  });

  it('scene_open reports the opened scene', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.open', { scene: 'res://levels/arena.tscn', root: { name: 'Arena', type: 'Node3D' } });

    const result = await createSceneOpenTool(editor).execute({ path: 'res://levels/arena.tscn' });

    expect(textOf(result)).toBe('Opened res://levels/arena.tscn (root Arena: Node3D).');
  });

  it('scene_save lists the saved scenes', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('scene.save', { saved: ['res://levels/arena.tscn'], scripts: [] })
      .respondTo('scene.save', { saved: ['res://a.tscn', 'res://b.tscn'], scripts: [] });

    expect(textOf(await createSceneSaveTool(editor).execute({}))).toBe('Saved res://levels/arena.tscn.');
    expect(textOf(await createSceneSaveTool(editor).execute({ all: true }))).toBe('Saved 2 scenes: res://a.tscn, res://b.tscn.');
  });

  it('scene_save names the scripts the editor wrote along with the scene', async () => {
    const editor = new FakeEditorGateway().respondTo('scene.save', { saved: ['res://levels/arena.tscn'], scripts: ['res://player/player.gd'] });

    const text = textOf(await createSceneSaveTool(editor).execute({}));

    expect(text).toBe(
      [
        'Saved res://levels/arena.tscn.',
        'The editor also saved unsaved changes from its script editor to res://player/player.gd; read the files again before editing them.',
      ].join('\n'),
    );
  });

  it('scene_close says what happened to unsaved changes and what the editor shows now', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('scene.close', { closed: 'res://levels/arena.tscn', saved: false, discarded_changes: false, current: 'res://main.tscn' })
      .respondTo('scene.close', { closed: 'res://levels/arena.tscn', saved: true, discarded_changes: false, current: 'res://main.tscn' })
      .respondTo('scene.close', { closed: 'res://main.tscn', saved: false, discarded_changes: true, current: '' });

    const plain = await createSceneCloseTool(editor).execute({});
    const saved = await createSceneCloseTool(editor).execute({ unsaved: 'save' });
    const discarded = await createSceneCloseTool(editor).execute({ scene: 'res://main.tscn', unsaved: 'discard' });

    expect(editor.requests.map((request) => request.params)).toEqual([{}, { unsaved: 'save' }, { scene: 'res://main.tscn', unsaved: 'discard' }]);
    expect(textOf(plain)).toBe('Closed res://levels/arena.tscn. The editor shows res://main.tscn now.');
    expect(textOf(saved)).toBe('Closed res://levels/arena.tscn after saving it. The editor shows res://main.tscn now.');
    expect(textOf(discarded)).toBe('Closed res://main.tscn without its unsaved changes. No scene is open now.');
    expect(createSceneCloseTool(editor).definition.annotations.destructiveHint).toBe(true);
  });

  it('scene tools are annotated honestly', () => {
    const editor = new FakeEditorGateway();

    expect(createSceneGetTreeTool(editor).definition.annotations.readOnlyHint).toBe(true);
    expect(createSceneGetTreeTool(editor).definition.alwaysLoad).toBe(true);
    expect(createSceneCreateTool(editor).definition.annotations.readOnlyHint).toBe(false);
    expect(createSceneCreateTool(editor).definition.annotations.destructiveHint).toBe(false);
  });
});
