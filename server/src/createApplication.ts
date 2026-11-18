import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/server';
import { DocsSource } from './docs/DocsSource.js';
import { EditorLauncher, systemClock } from './editor/EditorLauncher.js';
import { EditorOrHeadlessGateway } from './editor/EditorOrHeadlessGateway.js';
import { DebugAdapterClient } from './debug/DebugAdapterClient.js';
import { GameDebugger } from './debug/GameDebugger.js';
import { ProjectExporter } from './export/ProjectExporter.js';
import { AddonInstaller } from './addon/AddonInstaller.js';
import type { EditorSession } from './bridge/EditorConnection.js';
import { readAddonVersion } from './addon/InstalledAddon.js';
import type { GodotBinaryLocator } from './godot/GodotBinaryLocator.js';
import { GodotCli } from './godot/GodotCli.js';
import { bundledAddonDirectory } from './packageFiles.js';
import { ProjectCreator } from './project/ProjectCreator.js';
import { editorHelpCacheCandidates } from './docs/EditorHelpDocs.js';
import { ProjectLocator } from './project/ProjectLocator.js';
import { type Adoption, ProjectCreateTool } from './tools/ProjectCreateTool.js';
import { PluginSetEnabledTool, TestInstallFrameworkTool } from './tools/pluginTools.js';
import { ExportPresetAddTool } from './tools/ExportPresetAddTool.js';
import { ScriptRenameTool } from './tools/ScriptRenameTool.js';
import { ScriptRenamer } from './scripts/ScriptRenamer.js';
import { LanguageServerClient } from './lsp/LanguageServerClient.js';
import { ExportPresetWriter } from './export/ExportPresetWriter.js';
import { PluginSwitch } from './addon/PluginSwitch.js';
import { TestFrameworkInstaller } from './testing/TestFrameworkInstaller.js';
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
import { CodeValidator } from './scripts/CodeValidator.js';
import { createScriptValidator } from './scripts/createScriptValidator.js';
import { ShaderValidator } from './scripts/ShaderValidator.js';
import { type ApplicationEnvironment, createGodotContext } from './createGodotContext.js';
import { type ApplicationParts, ProjectFollowingApplication } from './server/ProjectFollowingApplication.js';
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

const frameworkRescanTimeoutMs = 90_000;

export interface Application {
  createMcpServer(): McpServer;
  shutdown(): void;
}

export function createApplication(environment: ApplicationEnvironment): Application {
  return new ProjectFollowingApplication(
    (createdProjectRoot, adopt) => createApplicationParts(environment, createdProjectRoot, adopt),
    { name: SERVER_NAME, version: SERVER_VERSION },
    () => new ProjectLocator(environment.variables, environment.workingDirectory).locate(),
  );
}

function createApplicationParts(environment: ApplicationEnvironment, createdProjectRoot: string | undefined, adopt: (root: string) => Adoption): ApplicationParts {
  const { project, discovery, editor, binaryLocator, locateGodot } = createGodotContext(environment, undefined, createdProjectRoot);
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
    helpCacheCandidates: (binaryPath, versionBranch) =>
      editorHelpCacheCandidates({ platform: environment.platform, homeDirectory: environment.homeDirectory, variables: environment.variables, binaryPath }, versionBranch),
    helpDumpScript: join(environment.bundledAddonDirectory ?? bundledAddonDirectory, 'docs', 'editor_help_dump.gd'),
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
    new ProjectCreateTool(
      new ProjectCreator({
        workingDirectory: environment.variables['CLAUDE_PROJECT_DIR'] ?? environment.workingDirectory,
        installAddon: (projectRoot) => addonInstaller(environment).install(projectRoot),
        readVersionBranch: () => readVersionBranch(binaryLocator, processRunner),
      }),
      adopt,
    ),
    ...createEditorTools(editor, projectReader, readFileSync),
    new ScriptRenameTool(
      new ScriptRenamer({
        projectRoot: project.found ? project.root : undefined,
        editor,
        languageServerAddress: async () => {
          const address = await editor.languageServer();
          const port = parsePort(environment.variables['GODOT_LSP_PORT']);
          return address === undefined || port === undefined ? address : { ...address, port };
        },
        connect: (address) => LanguageServerClient.connect(address),
      }),
    ),
    new ScriptValidateTool(
      new CodeValidator(
        project.found ? project.root : undefined,
        createScriptValidator({
          projectRoot: project.found ? project.root : undefined,
          editor,
          locateGodot,
          processRunner,
          languageServerPort: parsePort(environment.variables['GODOT_LSP_PORT']),
        }),
        new ShaderValidator(projectReader),
      ),
      errorSummary,
    ),
    new PluginSetEnabledTool(new PluginSwitch(project.found ? project.root : undefined, editor)),
    new TestInstallFrameworkTool(
      new TestFrameworkInstaller({
        projectRoot: project.found ? project.root : undefined,
        processRunner,
        plugins: new PluginSwitch(project.found ? project.root : undefined, editor),
        rescan: () => rescanWhenConnected(editor),
      }),
    ),
    new TestRunTool(
      new TestRunner({ projectRoot: project.found ? project.root : undefined, editor, locateBinary: locateGodot, processRunner, now: () => Date.now() }),
      errorSummary,
    ),
    new ExportPresetAddTool(new ExportPresetWriter(project.found ? project.root : undefined, editor)),
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
    project,
    instructions,
    tools,
    resources,
    prompts,
    shutdown: () => {
      localGame.shutdown();
      gameDebugger.close();
      editor.close();
    },
  };
}

function addonInstaller(environment: ApplicationEnvironment): AddonInstaller {
  const directory = environment.bundledAddonDirectory ?? bundledAddonDirectory;
  return new AddonInstaller({ bundle: { directory, version: readAddonVersion(directory) ?? '' }, isEditorRunning: () => false });
}

async function readVersionBranch(binaryLocator: GodotBinaryLocator, processRunner: NodeProcessRunner): Promise<string | undefined> {
  const binary = binaryLocator.locate();
  if (!binary.found) {
    return undefined;
  }
  try {
    const version = await new GodotCli(processRunner, binary.path).version();
    return `${String(version.major)}.${String(version.minor)}`;
  } catch {
    return undefined;
  }
}

async function rescanWhenConnected(editor: EditorSession): Promise<void> {
  if ((await editor.status()).connected) {
    await editor.request('editor.rescan', {}, { timeoutMs: frameworkRescanTimeoutMs });
  }
}
