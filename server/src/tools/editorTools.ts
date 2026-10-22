import type { EditorGateway } from '../editor/EditorGateway.js';
import { type CaptureReader, createEditorScreenshotTool } from './captureTools.js';
import { createInputMapGetTool, createInputMapSetTool } from './inputTools.js';
import {
  createNodeAddTool,
  createNodeDeleteTool,
  createNodeGetBoundsTool,
  createNodeGetPropertiesTool,
  createNodeSetPropertiesTool,
} from './nodeTools.js';
import {
  createEditorRescanTool,
  createProjectInfoTool,
  createProjectSettingsGetTool,
  createProjectSettingsSetTool,
} from './projectTools.js';
import { createSceneCreateTool, createSceneGetTreeTool, createSceneOpenTool, createSceneSaveTool } from './sceneTools.js';
import type { Tool } from './Tool.js';

export function createEditorTools(editor: EditorGateway, readCapture: CaptureReader): Tool[] {
  return [
    createProjectInfoTool(editor),
    createProjectSettingsGetTool(editor),
    createProjectSettingsSetTool(editor),
    createEditorRescanTool(editor),
    createEditorScreenshotTool(editor, readCapture),
    createInputMapGetTool(editor),
    createInputMapSetTool(editor),
    createSceneCreateTool(editor),
    createSceneOpenTool(editor),
    createSceneSaveTool(editor),
    createSceneGetTreeTool(editor),
    createNodeAddTool(editor),
    createNodeDeleteTool(editor),
    createNodeGetPropertiesTool(editor),
    createNodeGetBoundsTool(editor),
    createNodeSetPropertiesTool(editor),
  ];
}
