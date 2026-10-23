import { accessSync, constants, statSync } from 'node:fs';
import { BridgeClient } from './bridge/BridgeClient.js';
import { DiscoveryFileReader, isProcessAlive } from './bridge/DiscoveryFileReader.js';
import { EditorConnection, type EditorSession, UnavailableEditor } from './bridge/EditorConnection.js';
import { type BinaryLookup, GodotBinaryLocator } from './godot/GodotBinaryLocator.js';
import { type ProjectLookup, ProjectLocator } from './project/ProjectLocator.js';
import { BRIDGE_PROTOCOL_VERSION, SERVER_NAME, SERVER_VERSION } from './serverInfo.js';

export interface ApplicationEnvironment {
  readonly variables: Readonly<Record<string, string | undefined>>;
  readonly workingDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly homeDirectory: string;
}

export interface GodotContext {
  readonly project: ProjectLookup;
  readonly discovery: DiscoveryFileReader | undefined;
  readonly editor: EditorSession;
  readonly binaryLocator: GodotBinaryLocator;
  readonly locateGodot: () => Promise<BinaryLookup>;
}

const bridgeRequestTimeoutMs = 30_000;

export function createGodotContext(environment: ApplicationEnvironment, commandLineProjectPath?: string): GodotContext {
  const project = new ProjectLocator(environment.variables, environment.workingDirectory, commandLineProjectPath).locate();
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
  return { project, discovery, editor, binaryLocator, locateGodot };
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
