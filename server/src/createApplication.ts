import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import { DocsSource } from './docs/DocsSource.js';
import { EditorLauncher, systemClock } from './editor/EditorLauncher.js';
import { EditorOrHeadlessGateway } from './editor/EditorOrHeadlessGateway.js';
import { DebugAdapterClient } from './debug/DebugAdapterClient.js';
import { GameDebugger } from './debug/GameDebugger.js';
import { ProjectExporter } from './export/ProjectExporter.js';
import { GodotCli } from './godot/GodotCli.js';
import { NodeDetachedLauncher } from './process/DetachedLauncher.js';
import { NodeProcessLauncher } from './process/ProcessLauncher.js';
import { NodeProcessRunner } from './process/ProcessRunner.js';
import { FixLastRunPrompt } from './prompts/FixLastRunPrompt.js';
import { PlaytestPrompt } from './prompts/PlaytestPrompt.js';
import { HeadlessProjectQuery } from './project/HeadlessProjectQuery.js';
import { fileChangedAfter, listScenes } from './project/ProjectFiles.js';
import { readScriptLines } from './project/ScriptLines.js';
import { createGodotResources } from './resources/godotResources.js';
import { ErrorSummary } from './runtime/ErrorSummary.js';
import { GameGatewayRouter } from './runtime/GameGatewayRouter.js';
import { GameOutputCursor } from './runtime/GameOutputCursor.js';
import { LocalGameGateway } from './runtime/LocalGameGateway.js';
import { createScriptValidator } from './scripts/createScriptValidator.js';
import { type ApplicationEnvironment, createGodotContext } from './createGodotContext.js';
import { createMcpServer } from './server/createMcpServer.js';
import { readOnlyInstructions, serverInstructions, unsafeInstructions } from './server/serverInstructions.js';
import { applyToolPolicy, readToolPolicy } from './server/ToolPolicy.js';
import { SERVER_NAME, SERVER_VERSION } from './serverInfo.js';
import { TestRunner } from './testing/TestRunner.js';
import { DocsClassTool, DocsSearchTool } from './tools/docsTools.js';
import { EditorLaunchTool } from './tools/EditorLaunchTool.js';
import { createEditorTools } from './tools/editorTools.js';
import { ErrorReportingTool } from './tools/ErrorReportingTool.js';
import { ExportProjectTool } from './tools/ExportProjectTool.js';
import { createGameGetOutputTool, createGameTools } from './tools/gameTools.js';
import { GodotStatusTool } from './tools/GodotStatusTool.js';
import { createProjectInfoTool } from './tools/projectTools.js';
import { createDebugBreakpointsTool, createDebugContinueTool, createDebugStateTool } from './tools/debugTools.js';
import { createSceneGetTreeTool } from './tools/sceneTools.js';
import { ScriptValidateTool } from './tools/scriptTools.js';
import { TestRunTool } from './tools/TestRunTool.js';
import type { Tool } from './tools/Tool.js';
import { createEditorRunScriptTool, createFilesystemDeleteTool, createGameEvalTool, createNodeCallMethodTool } from './tools/unsafeTools.js';
import { userCacheDirectory } from './util/CacheDirectory.js';
import { parsePort } from './util/ports.js';

export interface Application {
  createMcpServer(): McpServer;
  shutdown(): void;
}


export function createApplication(environment: ApplicationEnvironment): Application {
  const { project, discovery, editor, binaryLocator, locateGodot } = createGodotContext(environment);
  const errorSummary = new ErrorSummary((resourcePath, timeMs) => project.found && fileChangedAfter(project.root, resourcePath, timeMs));
  editor.onNotification((connectionNumber, method, params) => {
    errorSummary.observe(connectionNumber, method, params);
  });
  const processRunner = new NodeProcessRunner();
  const editorLauncher = new EditorLauncher({
    projectRoot: project.found ? project.root : undefined,
    editor,
    readDiscovery: () => discovery?.read() ?? { kind: 'missing', path: '' },
    locateBinary: () => binaryLocator.locate(),
    readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
    launcher: new NodeDetachedLauncher(),
    clock: systemClock,
    ports: { languageServer: parsePort(environment.variables['GODOT_LSP_PORT']), debugAdapter: parsePort(environment.variables['GODOT_DAP_PORT']) },
  });
  const docsSource = new DocsSource({
    projectRoot: project.found ? project.root : undefined,
    cacheDirectory: userCacheDirectory(environment),
    locateBinary: locateGodot,
    processRunner,
  });
  const policy = readToolPolicy(environment.variables);
  const windowless = environment.variables['GODOT_MCP_HEADLESS'] === '1';
  const toolNotes: string[] = [];
  const localGame = new LocalGameGateway({
    projectRoot: project.found ? project.root : undefined,
    locateBinary: () => binaryLocator.locate(),
    launcher: new NodeProcessLauncher(),
    headless: windowless,
  });
  const gameGateway = new GameGatewayRouter(editor, localGame);
  const debugAdapterPort = parsePort(environment.variables['GODOT_DAP_PORT']);
  const gameDebugger = new GameDebugger({
    editor,
    debugAdapter: async () => {
      const address = await editor.debugAdapter();
      return address === undefined || debugAdapterPort === undefined ? address : { ...address, port: debugAdapterPort };
    },
    connect: (port) => DebugAdapterClient.connect(port),
  });
  const readScript = (file: string): string[] | undefined => (project.found ? readScriptLines(project.root, file) : undefined);
  const projectReader = new EditorOrHeadlessGateway(
    editor,
    new HeadlessProjectQuery({ projectRoot: project.found ? project.root : undefined, locateGodot, processRunner }),
  );
  const plainTools: Tool[] = [
    new GodotStatusTool({
      project,
      editor,
      binaryLocator,
      readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
      toolNotes,
    }),
    new EditorLaunchTool(editorLauncher, { headlessByDefault: windowless }),
    ...createEditorTools(editor, projectReader, readFileSync),
    new ScriptValidateTool(
      createScriptValidator({
        projectRoot: project.found ? project.root : undefined,
        editor,
        locateGodot,
        processRunner,
        languageServerPort: parsePort(environment.variables['GODOT_LSP_PORT']),
      }),
      errorSummary,
    ),
    new TestRunTool(
      new TestRunner({ projectRoot: project.found ? project.root : undefined, editor, locateBinary: locateGodot, processRunner, now: () => Date.now() }),
      errorSummary,
    ),
    new ExportProjectTool(
      new ProjectExporter({
        projectRoot: project.found ? project.root : undefined,
        editor,
        locateBinary: locateGodot,
        processRunner,
        readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
        now: () => Date.now(),
      }),
    ),
    new DocsClassTool(docsSource),
    new DocsSearchTool(docsSource),
    ...createGameTools(gameGateway, new GameOutputCursor(), readFileSync),
    createDebugBreakpointsTool(gameDebugger, readScript, errorSummary),
    createDebugStateTool(gameDebugger, readScript),
    createDebugContinueTool(gameDebugger, readScript),
    ...(policy.unsafe ? [createEditorRunScriptTool(editor), createNodeCallMethodTool(editor), createGameEvalTool(gameGateway), createFilesystemDeleteTool(editor)] : []),
  ];
  const selection = applyToolPolicy(plainTools, policy);
  toolNotes.push(...selection.notes);
  if (windowless) {
    toolNotes.push('Windowless mode (GODOT_MCP_HEADLESS): games run without a window, editor_launch starts the editor without one, and screenshots are not available.');
  }
  const tools = selection.tools.map((tool) => new ErrorReportingTool(tool, errorSummary));
  const resources = createGodotResources({
    projectInfo: createProjectInfoTool(projectReader),
    sceneTree: createSceneGetTreeTool(editor),
    classDocs: new DocsClassTool(docsSource),
    lastRunOutput: createGameGetOutputTool(gameGateway, new GameOutputCursor()),
    listScenes: () => (project.found ? listScenes(project.root) : []),
  });
  const prompts = policy.readOnly ? [] : [new FixLastRunPrompt(gameGateway), new PlaytestPrompt()];
  const instructions = [
    serverInstructions,
    ...(policy.readOnly ? [readOnlyInstructions] : []),
    ...(policy.unsafe && !policy.readOnly ? [unsafeInstructions] : []),
  ].join('\n');

  return {
    createMcpServer: () =>
      createMcpServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions, tools, resources, prompts }),
    shutdown: () => {
      localGame.shutdown();
      gameDebugger.close();
      editor.close();
    },
  };
}
