import { AddonInstaller } from '../addon/AddonInstaller.js';
import { readAddonVersion } from '../addon/InstalledAddon.js';
import { type ApplicationEnvironment, createGodotContext, type GodotContext } from '../createGodotContext.js';
import { GodotCli } from '../godot/GodotCli.js';
import { EditedScriptCheck } from '../hooks/EditedScriptCheck.js';
import { respondToEditedScript } from '../hooks/hookResponse.js';
import { NodeProcessRunner } from '../process/ProcessRunner.js';
import { EditorOrHeadlessGateway } from '../editor/EditorOrHeadlessGateway.js';
import { HeadlessProjectQuery } from '../project/HeadlessProjectQuery.js';
import { CodeValidator } from '../scripts/CodeValidator.js';
import { ProjectCreator } from '../project/ProjectCreator.js';
import { createScriptValidator } from '../scripts/createScriptValidator.js';
import { ShaderValidator } from '../scripts/ShaderValidator.js';
import type { ValidationResult } from '../scripts/ScriptValidator.js';
import { SERVER_NAME, SERVER_VERSION } from '../serverInfo.js';
import { describeError } from '../util/errors.js';
import { parsePort } from '../util/ports.js';
import { type CommandLineRequest, type ProjectCommand, usage } from './CommandLine.js';
import { type CommandReport, failed } from './CommandReport.js';
import { Doctor } from './Doctor.js';

export interface CommandLineEnvironment extends ApplicationEnvironment {
  readonly nodeVersion: string;
  readonly bundledAddonDirectory: string;
  readonly readInput: () => Promise<string>;
}

export interface CommandOutput {
  readonly write: (line: string) => void;
  readonly writeError: (line: string) => void;
}

type CommandRequest = Exclude<CommandLineRequest, { readonly kind: 'serve' }>;

const failureExitCode = 1;
const usageErrorExitCode = 2;

export async function runCommand(request: CommandRequest, environment: CommandLineEnvironment, output: CommandOutput): Promise<number> {
  switch (request.kind) {
    case 'help':
      usage.split('\n').forEach((line) => {
        output.write(line);
      });
      return 0;
    case 'version':
      output.write(`${SERVER_NAME} ${SERVER_VERSION}`);
      return 0;
    case 'invalid':
      [request.reason, '', ...usage.split('\n')].forEach((line) => {
        output.writeError(line);
      });
      return usageErrorExitCode;
    case 'check-edited-script':
      return checkEditedScript(environment, output);
    case 'init':
      return createProject(request.projectPath, environment, output);
    default:
      return runProjectCommand(request.kind, request.projectPath, environment, output);
  }
}

async function runProjectCommand(command: ProjectCommand, projectPath: string | undefined, environment: CommandLineEnvironment, output: CommandOutput): Promise<number> {
  const context = createGodotContext(environment, projectPath);
  try {
    const report = await reportOf(command, context, environment);
    report.lines.forEach((line) => {
      output.write(line);
    });
    return report.succeeded ? 0 : failureExitCode;
  } catch (error) {
    output.writeError(`${command} failed: ${describeError(error)}`);
    return failureExitCode;
  } finally {
    context.editor.close();
  }
}

async function createProject(folder: string | undefined, environment: CommandLineEnvironment, output: CommandOutput): Promise<number> {
  const context = createGodotContext(environment);
  const processRunner = new NodeProcessRunner();
  const bundleVersion = readAddonVersion(environment.bundledAddonDirectory);
  try {
    const created = await new ProjectCreator({
      workingDirectory: environment.workingDirectory,
      installAddon: (projectRoot) =>
        new AddonInstaller({ bundle: { directory: environment.bundledAddonDirectory, version: bundleVersion ?? '' }, isEditorRunning: () => false }).install(projectRoot),
      readVersionBranch: async () => {
        const binary = context.binaryLocator.locate();
        if (!binary.found) {
          return undefined;
        }
        const version = await new GodotCli(processRunner, binary.path).version().catch(() => undefined);
        return version === undefined ? undefined : `${String(version.major)}.${String(version.minor)}`;
      },
    }).create({ path: folder });
    const [width, height] = created.windowSize;
    output.write(
      `Created the Godot project "${created.name}" in ${created.root}: project.godot (Forward+, Jolt Physics, window ${String(width)}×${String(height)}), the main scene ${created.mainScene}, .gitignore, .gitattributes and .editorconfig.`,
    );
    output.write(`${created.addon} Its plugin is enabled.`);
    output.write(`Next: open it in the Godot editor (godot --editor --path ${created.root}), or start Claude Code in ${created.root} and ask for the game.`);
    return 0;
  } catch (error) {
    output.writeError(`init failed: ${describeError(error)}`);
    return failureExitCode;
  } finally {
    context.editor.close();
  }
}

async function checkEditedScript(environment: CommandLineEnvironment, output: CommandOutput): Promise<number> {
  let hookInput: unknown;
  try {
    hookInput = JSON.parse(await environment.readInput());
  } catch {
    return 0;
  }
  const outcome = await new EditedScriptCheck((projectRoot, scriptPath) => validateScript(environment, projectRoot, scriptPath)).check(hookInput);
  const response = respondToEditedScript(outcome);
  response.standardOutput.forEach((line) => {
    output.write(line);
  });
  response.standardError.forEach((line) => {
    output.writeError(line);
  });
  return response.exitCode;
}

async function validateScript(environment: CommandLineEnvironment, projectRoot: string, scriptPath: string): Promise<ValidationResult> {
  const context = createGodotContext(environment, projectRoot);
  try {
    const processRunner = new NodeProcessRunner();
    const scripts = createScriptValidator({
      projectRoot,
      editor: context.editor,
      locateGodot: context.locateGodot,
      processRunner,
      languageServerPort: parsePort(environment.variables['GODOT_LSP_PORT']),
    });
    const shaders = new ShaderValidator(new EditorOrHeadlessGateway(context.editor, new HeadlessProjectQuery({ projectRoot, locateGodot: context.locateGodot, processRunner })));
    return await new CodeValidator(projectRoot, scripts, shaders).validate([scriptPath]);
  } finally {
    context.editor.close();
  }
}

async function reportOf(command: ProjectCommand, context: GodotContext, environment: CommandLineEnvironment): Promise<CommandReport> {
  if (command === 'doctor') {
    const processRunner = new NodeProcessRunner();
    return new Doctor({
      nodeVersion: environment.nodeVersion,
      packageVersion: SERVER_VERSION,
      project: context.project,
      editor: context.editor,
      binaryLocator: context.binaryLocator,
      readVersion: (executablePath) => new GodotCli(processRunner, executablePath).version(),
    }).check();
  }
  const { project } = context;
  if (!project.found) {
    return failed(project.reason);
  }
  const bundleVersion = readAddonVersion(environment.bundledAddonDirectory);
  if (bundleVersion === undefined) {
    return failed(`This package has no addon in ${environment.bundledAddonDirectory}. Build it with: npm run build`);
  }
  const installer = new AddonInstaller({
    bundle: { directory: environment.bundledAddonDirectory, version: bundleVersion },
    isEditorRunning: () => context.discovery?.read().kind === 'found',
  });
  return command === 'install-addon' ? installer.install(project.root) : installer.update(project.root);
}
