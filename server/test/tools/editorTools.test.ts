import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { BridgeRequestError } from '../../src/bridge/BridgeErrors.js';
import { createEditorTools } from '../../src/tools/editorTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

describe('createEditorTools', () => {
  const tools = createEditorTools(new FakeEditorGateway(), new FakeEditorGateway(), () => Buffer.alloc(0));

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
      'resource_create',
      'resource_get',
      'resource_set_properties',
      'resource_find_usages',
      'filesystem_move',
      'asset_import_settings_get',
      'asset_import_settings_set',
      'navigation_bake',
      'animation_get',
      'animation_set',
      'animation_delete',
      'animation_tree_get',
      'animation_tree_set',
      'autoload_add',
      'autoload_remove',
      'node_set_groups',
      'editor_select',
      'scene_close',
    ]);
  });

  it('loads the tools that most sessions use up front', () => {
    expect(tools.filter((tool) => tool.definition.alwaysLoad).map((tool) => tool.name)).toEqual([
      'project_info',
      'editor_rescan',
      'input_map_get',
      'scene_save',
      'scene_get_tree',
      'scene_batch_edit',
      'node_get_properties',
    ]);
  });

  it('reads the project and its scenes through the project reader, which works without the editor too', async () => {
    const methods = ['project.info', 'project.settings_get', 'input_map.get', 'scene.get_tree', 'node.find', 'node.get_properties', 'node.get_bounds', 'signal.list'];
    const editor = new FakeEditorGateway();
    const projectReader = methods.reduce((gateway, method) => gateway.respondTo(method, new BridgeRequestError('Read', -32010, undefined, undefined)), new FakeEditorGateway());
    const readingTools = createEditorTools(editor, projectReader, () => Buffer.alloc(0));
    const readers = ['project_info', 'project_settings_get', 'input_map_get', 'scene_get_tree', 'node_find', 'node_get_properties', 'node_get_bounds', 'signal_list'];

    for (const tool of readingTools.filter((candidate) => readers.includes(candidate.name))) {
      await tool.execute({ scene: 'main', path: 'Player', names: ['position'], node: 'Player' });
    }

    expect(editor.requests).toEqual([]);
    expect(projectReader.requests.map((request) => request.method)).toEqual(methods);
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
