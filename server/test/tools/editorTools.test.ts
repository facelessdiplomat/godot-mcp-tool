import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { createEditorTools } from '../../src/tools/editorTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

describe('createEditorTools', () => {
  const tools = createEditorTools(new FakeEditorGateway(), () => Buffer.alloc(0));

  it('offers the editor tools', () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'project_info',
      'project_settings_get',
      'project_settings_set',
      'editor_rescan',
      'editor_screenshot',
      'input_map_get',
      'input_map_set',
      'scene_create',
      'scene_open',
      'scene_save',
      'scene_get_tree',
      'scene_batch_edit',
      'node_add',
      'node_delete',
      'node_duplicate',
      'node_reparent',
      'node_find',
      'node_get_properties',
      'node_get_bounds',
      'node_set_properties',
      'signal_list',
      'signal_connect',
      'signal_disconnect',
    ]);
  });

  it('loads the core editing loop up front', () => {
    expect(tools.filter((tool) => tool.definition.alwaysLoad).map((tool) => tool.name)).toEqual([
      'scene_get_tree',
      'node_add',
      'node_set_properties',
    ]);
  });

  it('describes every parameter', () => {
    for (const tool of tools) {
      const properties = z.toJSONSchema(tool.definition.inputSchema, { io: 'input' }).properties ?? {};
      for (const [parameterName, parameter] of Object.entries(properties)) {
        expect(typeof parameter === 'object' ? parameter.description : undefined, `${tool.name}.${parameterName}`).toBeTruthy();
      }
    }
  });
});
