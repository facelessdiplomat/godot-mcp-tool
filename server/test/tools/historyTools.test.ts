import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createEditorRedoTool, createEditorUndoTool } from '../../src/tools/historyTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

describe('history tools', () => {
  it('editor_undo names the actions it took back and what comes next', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.undo', {
      scene: 'res://levels/arena.tscn',
      undone: ['MCP: Set properties of Crate', 'MCP: Add Crate'],
      stopped: '',
      next_undo: 'MCP: Create scene',
      next_redo: 'MCP: Add Crate',
    });

    const result = await createEditorUndoTool(editor).execute({ count: 2 });

    expect(editor.requests[0]?.params).toEqual({ count: 2, include_user_actions: false });
    expect(textOf(result)).toBe(
      [
        'Undid 2 actions in res://levels/arena.tscn: MCP: Set properties of Crate; MCP: Add Crate. The scene has unsaved changes.',
        'Next to undo: MCP: Create scene. Next to redo: MCP: Add Crate.',
      ].join('\n'),
    );
  });

  it('editor_undo stops at an action of the user', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.undo', { scene: 'res://levels/arena.tscn', undone: [], stopped: 'user_action', next_undo: 'Move Node', next_redo: '' });

    const result = await createEditorUndoTool(editor).execute({});

    expect(textOf(result)).toBe(
      [
        'Nothing was undone in res://levels/arena.tscn.',
        'It stopped at "Move Node", an action of the user; pass include_user_actions: true to undo it too.',
        'Next to undo: Move Node. Next to redo: nothing.',
      ].join('\n'),
    );
  });

  it('editor_redo says when there is nothing to redo', async () => {
    const editor = new FakeEditorGateway().respondTo('editor.redo', { scene: 'res://levels/arena.tscn', redone: [], stopped: 'nothing_left', next_undo: 'MCP: Add Crate', next_redo: '' });

    const result = await createEditorRedoTool(editor).execute({});

    expect(textOf(result).split('\n')[0]).toBe('Nothing to redo in res://levels/arena.tscn.');
  });
});
