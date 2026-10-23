import { AddonInstaller } from '../addon/AddonInstaller.js';
import { readAddonVersion } from '../addon/InstalledAddon.js';
import { type ApplicationEnvironment, createGodotContext, type GodotContext } from '../createGodotContext.js';
import { GodotCli } from '../godot/GodotCli.js';
import { NodeProcessRunner } from '../process/ProcessRunner.js';
import { SERVER_NAME, SERVER_VERSION } from '../serverInfo.js';
import { describeError } from '../util/errors.js';
import { type CommandLineRequest, type ProjectCommand, usage } from './CommandLine.js';
import { type CommandReport, failed } from './CommandReport.js';
import { Doctor } from './Doctor.js';

export interface CommandLineEnvironment extends ApplicationEnvironment {
  readonly nodeVersion: string;
  readonly bundledAddonDirectory: string;
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
