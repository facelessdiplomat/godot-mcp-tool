import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createEditorRunScriptTool, createFilesystemDeleteTool, createGameEvalTool, createNodeCallMethodTool } from '../../src/tools/unsafeTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('unsafe tools', () => {
  it('editor_run_script shows what the code returned and the errors it ran into', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('editor.run_script', { value: ['Camera', 'Floor'], errors: [] })
      .respondTo('editor.run_script', { value: null, errors: [{ line: 2, message: "Out of bounds get index '5' (on base: 'Array')" }] });

    const clean = await createEditorRunScriptTool(editor).execute({ code: 'return scene.get_children().map(func(child): return child.name)' });
    const failing = await createEditorRunScriptTool(editor).execute({ code: 'var items := [1]\nreturn items[5]' });

    expect(editor.requests[0]?.params).toEqual({ code: 'return scene.get_children().map(func(child): return child.name)' });
    expect(textOf(clean)).toBe('The code ran in the editor and returned ["Camera","Floor"]. Its changes are not in the Undo history.');
    expect(failing.isError).toBe(true);
    expect(textOf(failing)).toBe("The code ran in the editor with errors and returned null:\n- line 2: Out of bounds get index '5' (on base: 'Array')");
  });

  it('node_call_method reports the returned value and the properties it changed', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('node.call_method', { scene: 'res://levels/arena.tscn', path: 'Camera', method: 'look_at', value: null, changed: ['rotation'] })
      .respondTo('node.call_method', { scene: 'res://levels/arena.tscn', path: 'Camera', method: 'get_child_count', value: 0, changed: [] });

    const looked = await createNodeCallMethodTool(editor).execute({ path: 'Camera', method: 'look_at', args: [[0, 0, 0]] });
    const counted = await createNodeCallMethodTool(editor).execute({ path: 'Camera', method: 'get_child_count' });

    expect(editor.requests[0]?.params).toEqual({ path: 'Camera', method: 'look_at', args: [[0, 0, 0]] });
    expect(editor.requests[1]?.params).toEqual({ path: 'Camera', method: 'get_child_count', args: [] });
    expect(textOf(looked)).toBe('Called look_at on Camera in res://levels/arena.tscn. It changed rotation, recorded as one Undo step; the scene has unsaved changes.');
    expect(textOf(counted)).toBe('Called get_child_count on Camera in res://levels/arena.tscn: it returned 0 and changed no property of Camera.');
  });

  it('game_eval shows the value with its type', async () => {
    const game = new FakeEditorGateway().respondTo('game.eval', { node: 'Player', value: 'Vector3(0, 1, 0)', type: 'Vector3' });

    const result = await createGameEvalTool(game).execute({ expression: 'position', node: 'Player' });

    expect(game.requests[0]?.params).toEqual({ expression: 'position', node: 'Player' });
    expect(textOf(result)).toBe('position on Player in the running game = Vector3(0, 1, 0)  [Vector3]');
  });

  it('filesystem_delete deletes nothing while the project uses the files, and lists the uses', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('filesystem.delete', {
        deleted: [],
        blocked: true,
        failed: [],
        used_by: [{ path: 'res://crate.tscn', uses: ['res://materials/ice.tres'] }],
        settings: [{ name: 'application/run/main_scene', value: 'res://levels/arena.tscn' }],
        code: [{ path: 'res://menu.gd', line: 8, text: 'get_tree().change_scene_to_file("res://levels/arena.tscn")' }],
      })
      .respondTo('filesystem.delete', {
        deleted: [],
        blocked: true,
        failed: [],
        used_by: [],
        settings: [],
        code: [{ path: 'res://loot.gd', line: 3, text: 'const TABLE := "res://loot_table.json"' }],
      });

    const several = await createFilesystemDeleteTool(editor).execute({ paths: ['res://materials/ice.tres', 'res://levels/arena.tscn'] });
    const one = await createFilesystemDeleteTool(editor).execute({ paths: ['res://loot_table.json'] });

    expect(editor.requests[0]?.params).toEqual({ paths: ['res://materials/ice.tres', 'res://levels/arena.tscn'], force: false });
    expect(several.isError).toBe(true);
    expect(textOf(several)).toBe(
      [
        'Nothing was deleted: the project still uses these files.',
        'Used by:',
        '- res://crate.tscn: res://materials/ice.tres',
        'Project settings: application/run/main_scene = res://levels/arena.tscn',
        'Named in code:',
        '- res://menu.gd:8: get_tree().change_scene_to_file("res://levels/arena.tscn")',
        'Change those first, or pass force: true to delete anyway.',
      ].join('\n'),
    );
    expect(textOf(one)).toBe(
      [
        'Nothing was deleted: the project still uses res://loot_table.json.',
        'Named in code:',
        '- res://loot.gd:3: const TABLE := "res://loot_table.json"',
        'Change those first, or pass force: true to delete anyway.',
      ].join('\n'),
    );
  });

  it('filesystem_delete reports what went to the trash and what still refers to it', async () => {
    const editor = new FakeEditorGateway().respondTo('filesystem.delete', {
      deleted: ['res://materials/ice.tres'],
      blocked: false,
      failed: [{ path: 'res://locked.tres', reason: 'Permission denied' }],
      used_by: [{ path: 'res://crate.tscn', uses: ['res://materials/ice.tres'] }],
      settings: [{ name: 'rendering/environment/defaults/default_environment', value: '' }],
      code: [{ path: 'res://crate.gd', line: 3, text: 'const SKIN := preload("res://materials/ice.tres")' }],
    });

    const result = await createFilesystemDeleteTool(editor).execute({ paths: ['res://materials/ice.tres', 'res://locked.tres'], force: true });

    expect(textOf(result)).toBe(
      [
        'Moved res://materials/ice.tres to the system trash; it can be restored from there.',
        'These files still refer to the deleted files:',
        '- res://crate.tscn: res://materials/ice.tres',
        'Cleared project settings: rendering/environment/defaults/default_environment',
        'Scripts still name the deleted files:',
        '- res://crate.gd:3: const SKIN := preload("res://materials/ice.tres")',
        'Could not move to the trash:',
        '- res://locked.tres: Permission denied',
      ].join('\n'),
    );
  });

  it('filesystem_delete fails when nothing could be moved to the trash', async () => {
    const editor = new FakeEditorGateway().respondTo('filesystem.delete', {
      deleted: [],
      blocked: false,
      failed: [{ path: 'res://locked.tres', reason: 'Permission denied' }],
      used_by: [],
      settings: [],
      code: [],
    });

    const result = await createFilesystemDeleteTool(editor).execute({ paths: ['res://locked.tres'] });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(['Nothing was deleted.', 'Could not move to the trash:', '- res://locked.tres: Permission denied'].join('\n'));
  });

  it('asks the user before every call', () => {
    const editor = new FakeEditorGateway();

    for (const tool of [createEditorRunScriptTool(editor), createNodeCallMethodTool(editor), createGameEvalTool(editor), createFilesystemDeleteTool(editor)]) {
      expect(tool.definition.requiresUserInteraction).toBe(true);
      expect(tool.definition.annotations.destructiveHint).toBe(true);
    }
    expect(createEditorRunScriptTool(editor).definition.showsErrors).toBe(true);
  });
});
