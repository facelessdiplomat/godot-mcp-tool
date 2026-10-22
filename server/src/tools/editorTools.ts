import type { EditorGateway } from '../editor/EditorGateway.js';
import { createNodeAddTool, createNodeDeleteTool, createNodeGetPropertiesTool, createNodeSetPropertiesTool } from './nodeTools.js';
import {
  createEditorRescanTool,
  createProjectInfoTool,
  createProjectSettingsGetTool,
  createProjectSettingsSetTool,
} from './projectTools.js';
import { createSceneCreateTool, createSceneGetTreeTool, createSceneOpenTool, createSceneSaveTool } from './sceneTools.js';
import type { Tool } from './Tool.js';

export function createEditorTools(editor: EditorGateway): Tool[] {
  return [
    createProjectInfoTool(editor),
    createProjectSettingsGetTool(editor),
    createProjectSettingsSetTool(editor),
    createEditorRescanTool(editor),
    createSceneCreateTool(editor),
    createSceneOpenTool(editor),
    createSceneSaveTool(editor),
    createSceneGetTreeTool(editor),
    createNodeAddTool(editor),
    createNodeDeleteTool(editor),
    createNodeGetPropertiesTool(editor),
    createNodeSetPropertiesTool(editor),
  ];
}
