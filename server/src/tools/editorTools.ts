import type { EditorGateway } from '../editor/EditorGateway.js';
import { createAnimationDeleteTool, createAnimationGetTool, createAnimationSetTool } from './animationTools.js';
import { createAnimationTreeGetTool, createAnimationTreeSetTool } from './animationTreeTools.js';
import { createAssetImportSettingsGetTool, createAssetImportSettingsSetTool } from './assetTools.js';
import { createAutoloadAddTool, createAutoloadRemoveTool } from './autoloadTools.js';
import { createSceneBatchEditTool } from './batchTools.js';
import { type CaptureReader, createEditorScreenshotTool } from './captureTools.js';
import { createFilesystemMoveTool, createResourceFindUsagesTool } from './fileTools.js';
import { createInputMapGetTool, createInputMapSetTool } from './inputTools.js';
import { createNavigationBakeTool } from './navigationTools.js';
import { createNodeDuplicateTool, createNodeReparentTool } from './nodeStructureTools.js';
import {
  createNodeAddTool,
  createNodeDeleteTool,
  createNodeFindTool,
  createNodeGetBoundsTool,
  createNodeGetPropertiesTool,
  createNodeSetGroupsTool,
  createNodeSetPropertiesTool,
} from './nodeTools.js';
import {
  createEditorRescanTool,
  createEditorSelectTool,
  createProjectInfoTool,
  createProjectSettingsGetTool,
  createProjectSettingsSetTool,
} from './projectTools.js';
import { createResourceCreateTool, createResourceGetTool, createResourceSetPropertiesTool } from './resourceTools.js';
import { createSceneCloseTool, createSceneCreateTool, createSceneGetTreeTool, createSceneOpenTool, createSceneSaveTool } from './sceneTools.js';
import { createSignalConnectTool, createSignalDisconnectTool, createSignalListTool } from './signalTools.js';
import type { Tool } from './Tool.js';

export function createEditorTools(editor: EditorGateway, projectReader: EditorGateway, readCapture: CaptureReader): Tool[] {
  return [
    createProjectInfoTool(projectReader),
    createProjectSettingsGetTool(projectReader),
    createProjectSettingsSetTool(editor),
    createEditorRescanTool(editor),
    createEditorScreenshotTool(editor, readCapture),
    createInputMapGetTool(projectReader),
    createInputMapSetTool(editor),
    createSceneCreateTool(editor),
    createSceneOpenTool(editor),
    createSceneSaveTool(editor),
    createSceneGetTreeTool(projectReader),
    createSceneBatchEditTool(editor),
    createNodeAddTool(editor),
    createNodeDeleteTool(editor),
    createNodeDuplicateTool(editor),
    createNodeReparentTool(editor),
    createNodeFindTool(projectReader),
    createNodeGetPropertiesTool(projectReader),
    createNodeGetBoundsTool(projectReader),
    createNodeSetPropertiesTool(editor),
    createSignalListTool(projectReader),
    createSignalConnectTool(editor),
    createSignalDisconnectTool(editor),
    createResourceCreateTool(editor),
    createResourceGetTool(editor),
    createResourceSetPropertiesTool(editor),
    createResourceFindUsagesTool(editor),
    createFilesystemMoveTool(editor),
    createAssetImportSettingsGetTool(editor),
    createAssetImportSettingsSetTool(editor),
    createNavigationBakeTool(editor),
    createAnimationGetTool(editor),
    createAnimationSetTool(editor),
    createAnimationDeleteTool(editor),
    createAnimationTreeGetTool(editor),
    createAnimationTreeSetTool(editor),
    createAutoloadAddTool(editor),
    createAutoloadRemoveTool(editor),
    createNodeSetGroupsTool(editor),
    createEditorSelectTool(editor),
    createSceneCloseTool(editor),
  ];
}
