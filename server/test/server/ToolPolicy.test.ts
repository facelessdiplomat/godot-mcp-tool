import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { applyToolPolicy, readToolPolicy } from '../../src/server/ToolPolicy.js';
import { textResult } from '../../src/tools/results.js';
import type { Tool } from '../../src/tools/Tool.js';

const emptyInput = z.object({});

interface Marks {
  readonly requiresUserInteraction?: boolean;
  readonly unsafe?: boolean;
}

function tool(name: string, readOnly: boolean, marks: Marks = {}): Tool<typeof emptyInput> {
  return {
    name,
    definition: {
      title: name,
      description: name,
      inputSchema: emptyInput,
      annotations: { readOnlyHint: readOnly },
      alwaysLoad: false,
      ...marks,
    },
    execute: (): Promise<CallToolResult> => Promise.resolve(textResult(name)),
  };
}

const unsafeTool = { requiresUserInteraction: true, unsafe: true };

describe('tool policy', () => {
  it('reads the switches from the environment', () => {
    expect(readToolPolicy({})).toEqual({ readOnly: false, unsafe: false, disabled: [] });
    expect(readToolPolicy({ GODOT_MCP_READ_ONLY: '1', GODOT_MCP_UNSAFE: 'true', GODOT_MCP_DISABLE: ' game_run, node_delete ,' })).toEqual({
      readOnly: true,
      unsafe: true,
      disabled: ['game_run', 'node_delete'],
    });
    expect(readToolPolicy({ GODOT_MCP_READ_ONLY: '0', GODOT_MCP_UNSAFE: 'no' })).toMatchObject({ readOnly: false, unsafe: false });
  });

  it('leaves out disabled tools and, in read-only mode, every tool that changes something', () => {
    const applied = applyToolPolicy([tool('scene_get_tree', true), tool('node_add', false), tool('docs_class', true)], {
      readOnly: true,
      unsafe: false,
      disabled: ['docs_class', 'no_such_tool'],
    });

    expect(applied.tools.map((selected) => selected.name)).toEqual(['scene_get_tree']);
    expect(applied.notes).toEqual([
      'Read-only mode (GODOT_MCP_READ_ONLY): the tools that change the project or the game are left out.',
      'Turned off by GODOT_MCP_DISABLE: docs_class.',
      'GODOT_MCP_DISABLE names tools that do not exist: no_such_tool.',
    ]);
  });

  it('names the unsafe tools when they are on', () => {
    const tools = [tool('scene_get_tree', true), tool('test_install_framework', false, { requiresUserInteraction: true }), tool('game_eval', false, unsafeTool), tool('editor_run_script', false, unsafeTool)];

    const applied = applyToolPolicy(tools, { readOnly: false, unsafe: true, disabled: [] });

    expect(applied.tools).toHaveLength(4);
    expect(applied.notes).toEqual([
      'Unsafe tools are on (GODOT_MCP_UNSAFE): game_eval, editor_run_script. The editor must allow them too: Project → Tools → Godot MCP Tool → Allow Unsafe Tools in This Project.',
    ]);
  });

  it('leaves the unsafe tools out by default, but not the tools that only ask the user to confirm each call', () => {
    const tools = [tool('scene_get_tree', true), tool('test_install_framework', false, { requiresUserInteraction: true }), tool('game_eval', false, unsafeTool)];

    const applied = applyToolPolicy(tools, { readOnly: false, unsafe: false, disabled: [] });

    expect(applied.tools.map((selected) => selected.name)).toEqual(['scene_get_tree', 'test_install_framework']);
    expect(applied.notes).toEqual([]);
  });

  it('says nothing about the defaults', () => {
    expect(applyToolPolicy([tool('scene_get_tree', true)], { readOnly: false, unsafe: false, disabled: [] }).notes).toEqual([]);
  });
});
