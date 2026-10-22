import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { createGodotResources } from '../../src/resources/godotResources.js';
import { textResult } from '../../src/tools/results.js';
import type { Tool, ToolDefinition } from '../../src/tools/Tool.js';

const anyInput = z.object({}).catchall(z.unknown());

class RecordingTool implements Tool<typeof anyInput> {
  readonly inputs: Record<string, unknown>[] = [];
  readonly definition: ToolDefinition<typeof anyInput>;

  constructor(readonly name: string) {
    this.definition = { title: name, description: name, inputSchema: anyInput, annotations: { readOnlyHint: true }, alwaysLoad: false };
  }

  execute(input: z.input<typeof anyInput>): Promise<CallToolResult> {
    this.inputs.push(input);
    return Promise.resolve(textResult(`${this.name} ${JSON.stringify(input)}`));
  }
}

function resourcesWith(): { readonly tools: Record<string, RecordingTool>; readonly resources: ReturnType<typeof createGodotResources> } {
  const tools = {
    projectInfo: new RecordingTool('project_info'),
    sceneTree: new RecordingTool('scene_get_tree'),
    classDocs: new RecordingTool('docs_class'),
    lastRunOutput: new RecordingTool('game_get_output'),
  };
  return { tools, resources: createGodotResources({ ...tools, listScenes: () => ['res://levels/arena.tscn', 'res://main menu.tscn'] }) };
}

describe('godot resources', () => {
  it('offers the project, scenes, class docs and the last run', () => {
    expect(resourcesWith().resources.map((resource) => resource.definition.uri)).toEqual([
      'godot://project',
      'godot://scene/{+path}',
      'godot://docs/{class}',
      'godot://logs/last-run',
    ]);
  });

  it('reads each resource through its tool', async () => {
    const { tools, resources } = resourcesWith();
    const [project, scene, docs, lastRun] = resources;

    expect(await project?.read({})).toBe('project_info {}');
    expect(await scene?.read({ path: 'levels/arena.tscn' })).toBe('scene_get_tree {"scene":"res://levels/arena.tscn"}');
    expect(await docs?.read({ class: 'CharacterBody3D' })).toBe('docs_class {"name":"CharacterBody3D"}');
    expect(await lastRun?.read({})).toBe('game_get_output {"from_start":true,"max_entries":200}');
    expect(tools['sceneTree']?.inputs).toHaveLength(1);
  });

  it('lists the scenes of the project as concrete resources', () => {
    const [, scene] = resourcesWith().resources;

    expect(scene?.list?.()).toEqual([
      { uri: 'godot://scene/levels/arena.tscn', name: 'res://levels/arena.tscn' },
      { uri: 'godot://scene/main%20menu.tscn', name: 'res://main menu.tscn' },
    ]);
  });

  it('decodes escaped paths', async () => {
    const [, scene] = resourcesWith().resources;

    expect(await scene?.read({ path: 'main%20menu.tscn' })).toBe('scene_get_tree {"scene":"res://main menu.tscn"}');
  });
});
