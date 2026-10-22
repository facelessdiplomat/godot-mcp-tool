import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createAutoloadAddTool, createAutoloadRemoveTool } from '../../src/tools/autoloadTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const runtimeAgent = { name: 'GodotMcpRuntime', path: 'res://addons/godot_mcp_tool/runtime/runtime_agent.gd', singleton: true };

describe('autoload tools', () => {
  it('autoload_add registers the autoload and lists them all', async () => {
    const editor = new FakeEditorGateway().respondTo('autoload.add', {
      name: 'GameState',
      path: 'res://autoload/game_state.gd',
      autoloads: [runtimeAgent, { name: 'GameState', path: 'res://autoload/game_state.gd', singleton: true }],
    });

    const result = await createAutoloadAddTool(editor).execute({ name: 'GameState', path: 'res://autoload/game_state.gd' });

    expect(editor.requests[0]?.params).toEqual({ name: 'GameState', path: 'res://autoload/game_state.gd' });
    expect(textOf(result)).toBe(
      [
        'Added the autoload GameState → res://autoload/game_state.gd and saved project.godot; scripts reach it as GameState from the next game run.',
        'Autoloads: GodotMcpRuntime → res://addons/godot_mcp_tool/runtime/runtime_agent.gd, GameState → res://autoload/game_state.gd',
      ].join('\n'),
    );
  });

  it('autoload_remove says what it removed', async () => {
    const editor = new FakeEditorGateway().respondTo('autoload.remove', { name: 'GameState', path: 'res://autoload/game_state.gd', autoloads: [runtimeAgent] });

    const result = await createAutoloadRemoveTool(editor).execute({ name: 'GameState' });

    expect(textOf(result)).toBe(
      [
        'Removed the autoload GameState (res://autoload/game_state.gd) and saved project.godot. Scripts that still use GameState fail now; check them with script_validate.',
        'Autoloads: GodotMcpRuntime → res://addons/godot_mcp_tool/runtime/runtime_agent.gd',
      ].join('\n'),
    );
    expect(createAutoloadRemoveTool(editor).definition.annotations.destructiveHint).toBe(true);
  });
});
