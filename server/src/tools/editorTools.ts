import type { EditorGateway } from '../editor/EditorGateway.js';
import { createAnimationDeleteTool, createAnimationGetTool, createAnimationSetTool } from './animationTools.js';
import { createAnimationTreeGetTool, createAnimationTreeSetTool } from './animationTreeTools.js';
import { createAudioBusesGetTool, createAudioBusesSetTool } from './audioTools.js';
import { createAssetImportSettingsGetTool, createAssetImportSettingsSetTool } from './assetTools.js';
import { createAutoloadAddTool, createAutoloadRemoveTool } from './autoloadTools.js';
import { createSceneBatchEditTool } from './batchTools.js';
import { type CaptureReader, createEditorScreenshotTool } from './captureTools.js';
import { createFilesystemMoveTool, createResourceFindUsagesTool } from './fileTools.js';
import { createGridMapGetCellsTool, createGridMapSetCellsTool, createMeshLibraryCreateTool } from './gridMapTools.js';
import { createInputMapGetTool, createInputMapSetTool } from './inputTools.js';
import { createVoxelGiBakeTool } from './lightingTools.js';
import { createNavigationBakeTool, createNavigationGetPathTool } from './navigationTools.js';
import { createNodeDuplicateTool, createNodeMakeLocalTool, createNodeReparentTool, createNodeSaveAsSceneTool } from './nodeStructureTools.js';
import { createNodeAddCollisionTool, createNodeSnapToFloorTool, createSceneRaycastTool } from './placementTools.js';
import {
  createNodeAddTool,
  createNodeDeleteTool,
  createNodeFindTool,
  createNodeGetBoundsTool,
  createNodeGetPropertiesTool,
  createNodeSetGroupsTool,
  createNodeSetPropertiesTool,
} from './nodeTools.js';
import { EditorRescanTool } from './EditorRescanTool.js';
import {
  createEditorGetStateTool,
  createEditorSelectTool,
  createProjectInfoTool,
  createProjectSettingsGetTool,
  createProjectSettingsSetTool,
} from './projectTools.js';
import { createResourceCreateTool, createResourceGetTool, createResourceSetPropertiesTool } from './resourceTools.js';
import { createSceneCloseTool, createSceneCreateTool, createSceneGetTreeTool, createSceneOpenTool, createSceneSaveTool } from './sceneTools.js';
import { createSignalConnectTool, createSignalDisconnectTool, createSignalListTool } from './signalTools.js';
import { createTileMapGetCellsTool, createTileMapSetCellsTool, createTileSetAddAtlasTool } from './tileTools.js';
import type { Tool } from './Tool.js';
import { createEditorRedoTool, createEditorUndoTool } from './historyTools.js';
import { createUserDataGetTool } from './userDataTools.js';

export function createEditorTools(editor: EditorGateway, projectReader: EditorGateway, readCapture: CaptureReader, game: EditorGateway = editor): Tool[] {
  return [
    createProjectInfoTool(projectReader),
    createProjectSettingsGetTool(projectReader),
    createProjectSettingsSetTool(editor),
    createUserDataGetTool(projectReader),
    new EditorRescanTool(editor),
    createEditorScreenshotTool(editor, readCapture),
    createInputMapGetTool(projectReader),
    createInputMapSetTool(editor),
    createAudioBusesGetTool(projectReader, game),
    createAudioBusesSetTool(editor),
    createSceneCreateTool(editor),
    createSceneOpenTool(editor),
    createSceneSaveTool(editor),
    createSceneGetTreeTool(projectReader),
    createSceneBatchEditTool(editor),
    createNodeAddTool(editor),
    createNodeDeleteTool(editor),
    createNodeDuplicateTool(editor),
    createNodeReparentTool(editor),
    createNodeSaveAsSceneTool(editor),
    createNodeMakeLocalTool(editor),
    createNodeFindTool(projectReader),
    createNodeGetPropertiesTool(projectReader),
    createNodeGetBoundsTool(projectReader),
    createSceneRaycastTool(editor),
    createNodeSnapToFloorTool(editor),
    createNodeAddCollisionTool(editor),
    createNodeSetPropertiesTool(editor),
    createGridMapGetCellsTool(projectReader),
    createGridMapSetCellsTool(editor),
    createMeshLibraryCreateTool(editor),
    createTileMapGetCellsTool(projectReader),
    createTileMapSetCellsTool(editor),
    createSignalListTool(projectReader),
    createSignalConnectTool(editor),
    createSignalDisconnectTool(editor),
    createResourceCreateTool(editor),
    createResourceGetTool(editor),
    createResourceSetPropertiesTool(editor),
    createTileSetAddAtlasTool(editor),
    createResourceFindUsagesTool(editor),
    createFilesystemMoveTool(editor),
    createAssetImportSettingsGetTool(editor),
    createAssetImportSettingsSetTool(editor),
    createNavigationBakeTool(editor),
    createNavigationGetPathTool(projectReader),
    createVoxelGiBakeTool(editor),
    createAnimationGetTool(editor),
    createAnimationSetTool(editor),
    createAnimationDeleteTool(editor),
    createAnimationTreeGetTool(editor),
    createAnimationTreeSetTool(editor),
    createAutoloadAddTool(editor),
    createAutoloadRemoveTool(editor),
    createNodeSetGroupsTool(editor),
    createEditorSelectTool(editor),
    createEditorUndoTool(editor),
    createEditorRedoTool(editor),
    createEditorGetStateTool(editor),
    createSceneCloseTool(editor),
  ];
}
