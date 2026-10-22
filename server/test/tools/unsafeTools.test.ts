import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createEditorRunScriptTool, createGameEvalTool, createNodeCallMethodTool } from '../../src/tools/unsafeTools.js';
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

  it('asks the user before every call', () => {
    const editor = new FakeEditorGateway();

    for (const tool of [createEditorRunScriptTool(editor), createNodeCallMethodTool(editor), createGameEvalTool(editor)]) {
      expect(tool.definition.requiresUserInteraction).toBe(true);
      expect(tool.definition.annotations.destructiveHint).toBe(true);
    }
    expect(createEditorRunScriptTool(editor).definition.showsErrors).toBe(true);
  });
});
