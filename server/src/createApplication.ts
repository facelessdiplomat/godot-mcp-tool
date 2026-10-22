import { accessSync, constants, statSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import { BridgeClient } from './bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from './bridge/DiscoveryFileReader.js';
import { EditorConnection, type EditorSession, UnavailableEditor } from './bridge/EditorConnection.js';
import { GodotBinaryLocator } from './godot/GodotBinaryLocator.js';
import { GodotCli } from './godot/GodotCli.js';
import { NodeProcessLauncher } from './process/ProcessLauncher.js';
import { NodeProcessRunner } from './process/ProcessRunner.js';
import { ProjectLocator } from './project/ProjectLocator.js';
import { ErrorSummary } from './runtime/ErrorSummary.js';
import { GameGatewayRouter } from './runtime/GameGatewayRouter.js';
import { GameOutputCursor } from './runtime/GameOutputCursor.js';
import { LocalGameGateway } from './runtime/LocalGameGateway.js';
import { createMcpServer } from './server/createMcpServer.js';
import { serverInstructions } from './server/serverInstructions.js';
import { BRIDGE_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION } from './serverInfo.js';
import { createEditorTools } from './tools/editorTools.js';
import { ErrorReportingTool } from './tools/ErrorReportingTool.js';
import { createGameTools } from './tools/gameTools.js';
import { GodotStatusTool } from './tools/GodotStatusTool.js';

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

export function createApplication(environment: ApplicationEnvironment): Application {
  const project = new ProjectLocator(environment.variables, environment.workingDirectory).locate();
  const editor: EditorSession = project.found
    ? new EditorConnection(
        new DiscoveryFileReader(project.root, isProcessAlive),
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
  });
  const localGame = new LocalGameGateway({
    projectRoot: project.found ? project.root : undefined,
    locateBinary: () => binaryLocator.locate(),
    launcher: new NodeProcessLauncher(),
    headless: environment.variables['GODOT_MCP_HEADLESS'] === '1',
  });
  const tools = [
    new GodotStatusTool({
      project,
      editor,
      binaryLocator,
      readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
    }),
    ...createEditorTools(editor),
    ...createGameTools(new GameGatewayRouter(editor, localGame), new GameOutputCursor()),
  ].map((tool) => new ErrorReportingTool(tool, errorSummary));

  return {
    createMcpServer: () =>
      createMcpServer({ name: SERVER_NAME, version: SERVER_VERSION, instructions: serverInstructions, tools }),
    shutdown: () => {
      localGame.shutdown();
      editor.close();
    },
  };
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
