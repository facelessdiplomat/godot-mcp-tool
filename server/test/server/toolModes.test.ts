import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/createApplication.js';

interface ListedCapabilities {
  readonly names: string[];
  readonly instructions: string;
  readonly meta: Map<string, unknown>;
  readonly resourceTemplates: string[];
  readonly prompts: string[];
}

async function listedTools(variables: Record<string, string>): Promise<ListedCapabilities> {
  const application = createApplication({ variables, workingDirectory: '/nonexistent', platform: process.platform, homeDirectory: '/nonexistent' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await application.createMcpServer().connect(serverTransport);
  const client = new Client({ name: 'tool-modes-test', version: '1.0.0' });
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    const { resourceTemplates } = await client.listResourceTemplates();
    const { prompts } = await client.listPrompts();
    return {
      names: tools.map((tool) => tool.name),
      instructions: client.getInstructions() ?? '',
      meta: new Map(tools.map((tool) => [tool.name, tool._meta])),
      resourceTemplates: resourceTemplates.map((template) => template.uriTemplate),
      prompts: prompts.map((prompt) => prompt.name),
    };
  } finally {
    await client.close();
    application.shutdown();
  }
}

describe('tool modes', () => {
  it('leaves the unsafe tools out by default and offers the resources and prompts', async () => {
    const { names, resourceTemplates, prompts } = await listedTools({});

    expect(resourceTemplates).toEqual(['godot://scene/{+path}', 'godot://docs/{class}']);
    expect(prompts).toEqual(['fix_last_run', 'playtest']);

    expect(names).toContain('node_add');
    expect(names).toContain('filesystem_move');
    expect(names).toContain('export_project');
    expect(names).toEqual(expect.arrayContaining(['debug_breakpoints', 'debug_state', 'debug_continue']));
    expect(names).not.toContain('editor_run_script');
    expect(names).not.toContain('game_eval');
    expect(names).not.toContain('node_call_method');
    expect(names).not.toContain('filesystem_delete');
  });

  it('offers the unsafe tools with GODOT_MCP_UNSAFE and has the client confirm each call', async () => {
    const { names, instructions, meta } = await listedTools({ GODOT_MCP_UNSAFE: '1' });

    expect(names).toEqual(expect.arrayContaining(['editor_run_script', 'game_eval', 'node_call_method', 'filesystem_delete']));
    expect(meta.get('game_eval')).toEqual({ 'anthropic/requiresUserInteraction': true });
    expect(meta.get('filesystem_delete')).toEqual({ 'anthropic/requiresUserInteraction': true });
    expect(instructions).toContain('editor_run_script, game_eval and node_call_method are on');
    expect(instructions).toContain('Delete project files with filesystem_delete');
  });

  it('offers only reading tools in read-only mode and says so', async () => {
    const { names, instructions, prompts, resourceTemplates } = await listedTools({ GODOT_MCP_READ_ONLY: '1', GODOT_MCP_UNSAFE: '1' });

    expect(prompts).toEqual([]);
    expect(resourceTemplates).toHaveLength(2);

    expect(names).toContain('scene_get_tree');
    expect(names).toContain('godot_status');
    expect(names).toContain('resource_find_usages');
    expect(names).not.toContain('node_add');
    expect(names).not.toContain('filesystem_move');
    expect(names).not.toContain('filesystem_delete');
    expect(names).not.toContain('export_project');
    expect(names).toContain('debug_state');
    expect(names).not.toContain('debug_breakpoints');
    expect(names).not.toContain('debug_continue');
    expect(names).not.toContain('game_run');
    expect(names).not.toContain('game_eval');
    expect(instructions).toContain('read-only mode');
  });

  it('turns off the tools that GODOT_MCP_DISABLE names', async () => {
    const { names } = await listedTools({ GODOT_MCP_DISABLE: 'node_delete,game_run' });

    expect(names).not.toContain('node_delete');
    expect(names).not.toContain('game_run');
    expect(names).toContain('node_add');
  });
});
