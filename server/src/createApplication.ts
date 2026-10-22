import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import { BridgeClient } from './bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from './bridge/DiscoveryFileReader.js';
import { DocsSource } from './docs/DocsSource.js';
import { EditorLauncher, systemClock } from './editor/EditorLauncher.js';
import { EditorConnection, type EditorSession, UnavailableEditor } from './bridge/EditorConnection.js';
import { type BinaryLookup, GodotBinaryLocator } from './godot/GodotBinaryLocator.js';
import { GodotCli } from './godot/GodotCli.js';
import { LanguageServerClient } from './lsp/LanguageServerClient.js';
import { NodeDetachedLauncher } from './process/DetachedLauncher.js';
import { NodeProcessLauncher } from './process/ProcessLauncher.js';
import { NodeProcessRunner, type ProcessRunner } from './process/ProcessRunner.js';
import { FixLastRunPrompt } from './prompts/FixLastRunPrompt.js';
import { PlaytestPrompt } from './prompts/PlaytestPrompt.js';
import { readAutoloadNames } from './project/ProjectFile.js';
import { listScenes } from './project/ProjectFiles.js';
import { ProjectLocator } from './project/ProjectLocator.js';
import { createGodotResources } from './resources/godotResources.js';
import { ErrorSummary } from './runtime/ErrorSummary.js';
import { GameGatewayRouter } from './runtime/GameGatewayRouter.js';
import { GameOutputCursor } from './runtime/GameOutputCursor.js';
import { LocalGameGateway } from './runtime/LocalGameGateway.js';
import { ScriptValidator, ValidationUnavailableError } from './scripts/ScriptValidator.js';
import { createMcpServer } from './server/createMcpServer.js';
import { readOnlyInstructions, serverInstructions, unsafeInstructions } from './server/serverInstructions.js';
import { applyToolPolicy, readToolPolicy } from './server/ToolPolicy.js';
import { BRIDGE_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION } from './serverInfo.js';
import { TestRunner } from './testing/TestRunner.js';
import { DocsClassTool, DocsSearchTool } from './tools/docsTools.js';
import { EditorLaunchTool } from './tools/EditorLaunchTool.js';
import { createEditorTools } from './tools/editorTools.js';
import { ErrorReportingTool } from './tools/ErrorReportingTool.js';
import { createGameGetOutputTool, createGameTools } from './tools/gameTools.js';
import { GodotStatusTool } from './tools/GodotStatusTool.js';
import { createProjectInfoTool } from './tools/projectTools.js';
import { createSceneGetTreeTool } from './tools/sceneTools.js';
import { ScriptValidateTool } from './tools/scriptTools.js';
import { TestRunTool } from './tools/TestRunTool.js';
import type { Tool } from './tools/Tool.js';
import { createEditorRunScriptTool, createGameEvalTool, createNodeCallMethodTool } from './tools/unsafeTools.js';
import { userCacheDirectory } from './util/CacheDirectory.js';

export interface ApplicationEnvironment {
  readonly variables: Readonly<Record<string, string | undefined>>;
  readonly workingDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
}

export interface Application {
  createMcpServer(): McpServer;
  shutdown(): void;
}

const bridgeRequestTimeoutMs = 30_000;
const checkOnlyTimeoutMs = 60_000;

export function createApplication(environment: ApplicationEnvironment): Application {
  const project = new ProjectLocator(environment.variables, environment.workingDirectory).locate();
  const discovery = project.found ? new DiscoveryFileReader(project.root, isProcessAlive) : undefined;
  const editor: EditorSession = discovery
    ? new EditorConnection(
        discovery,
        (endpoint) =>
          new BridgeClient(endpoint, {
            clientName: `${SERVER_NAME}/${SERVER_VERSION}`,
            protocol: BRIDGE_PROTOCOL_VERSION,
            requestTimeoutMs: bridgeRequestTimeoutMs,
          }),
      )
    : new UnavailableEditor('No Godot project was found, so there is no editor to connect to.');
  const errorSummary = new ErrorSummary();
  editor.onNotification((connectionNumber, method, params) => {
    errorSummary.observe(connectionNumber, method, params);
  });
  const processRunner = new NodeProcessRunner();
  const binaryLocator = new GodotBinaryLocator({
    variables: environment.variables,
    platform: environment.platform,
    homeDirectory: environment.homeDirectory,
    isExecutableFile,
    lastEditorExecutable: () => discovery?.lastEditorExecutable(),
  });
  const locateGodot = async (): Promise<BinaryLookup> => {
    const editorStatus = await editor.status();
    return binaryLocator.locate(editorStatus.connected ? editorStatus.hello.executablePath : undefined);
  };
  const editorLauncher = new EditorLauncher({
    projectRoot: project.found ? project.root : undefined,
    editor,
    readDiscovery: () => discovery?.read() ?? { kind: 'missing', path: '' },
    locateBinary: () => binaryLocator.locate(),
    launcher: new NodeDetachedLauncher(),
    clock: systemClock,
  });
  const docsSource = new DocsSource({
    projectRoot: project.found ? project.root : undefined,
    cacheDirectory: userCacheDirectory(environment),
    locateBinary: locateGodot,
    processRunner,
  });
  const policy = readToolPolicy(environment.variables);
  const toolNotes: string[] = [];
  const localGame = new LocalGameGateway({
    projectRoot: project.found ? project.root : undefined,
    locateBinary: () => binaryLocator.locate(),
    launcher: new NodeProcessLauncher(),
    headless: environment.variables['GODOT_MCP_HEADLESS'] === '1',
  });
  const gameGateway = new GameGatewayRouter(editor, localGame);
  const plainTools: Tool[] = [
    new GodotStatusTool({
      project,
      editor,
      binaryLocator,
      readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
      toolNotes,
    }),
    new EditorLaunchTool(editorLauncher),
    ...createEditorTools(editor, readFileSync),
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
    new DocsClassTool(docsSource),
    new DocsSearchTool(docsSource),
    ...createGameTools(gameGateway, new GameOutputCursor(), readFileSync),
    ...(policy.unsafe ? [createEditorRunScriptTool(editor), createNodeCallMethodTool(editor), createGameEvalTool(gameGateway)] : []),
  ];
  const selection = applyToolPolicy(plainTools, policy);
  toolNotes.push(...selection.notes);
  const tools = selection.tools.map((tool) => new ErrorReportingTool(tool, errorSummary));
  const resources = createGodotResources({
    projectInfo: createProjectInfoTool(editor),
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
      editor.close();
    },
  };
}

interface ScriptValidatorSetup {
  readonly projectRoot: string | undefined;
  readonly editor: EditorSession;
  readonly locateGodot: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
  readonly languageServerPort: number | undefined;
}

function createScriptValidator({ projectRoot, editor, locateGodot, processRunner, languageServerPort }: ScriptValidatorSetup): ScriptValidator {
  return new ScriptValidator({
    projectRoot,
    editor,
    languageServerAddress: async () => {
      const address = await editor.languageServer();
      return address === undefined || languageServerPort === undefined ? address : { ...address, port: languageServerPort };
    },
    connectLanguageServer: (address) => LanguageServerClient.connect(address),
    runCheckOnly: async (resourcePath) => {
      const binary = await locateGodot();
      if (!binary.found || projectRoot === undefined) {
        throw new ValidationUnavailableError(
          `The Godot editor is not connected, and scripts cannot be checked without it: ${binary.found ? 'no Godot project was found.' : binary.reason}`,
        );
      }
      const result = await processRunner.run(binary.path, ['--headless', '--path', projectRoot, '--check-only', '--script', resourcePath], {
        timeoutMs: checkOnlyTimeoutMs,
      });
      return `${result.stdout}\n${result.stderr}`;
    },
    readAutoloadNames: () => (projectRoot === undefined ? [] : readAutoloadNames(projectRoot)),
  });
}

function parsePort(text: string | undefined): number | undefined {
  const port = Number(text);
  return text !== undefined && Number.isInteger(port) && port > 0 && port < 65_536 ? port : undefined;
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
