import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { EditorStatusProvider } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { BinaryLookup } from '../godot/GodotBinaryLocator.js';
import type { ProcessResult, ProcessRunner } from '../process/ProcessRunner.js';
import { readScriptErrors, type ScriptErrorEntry } from '../scripts/ScriptErrorOutput.js';
import { readJUnitReport, type TestCaseResult } from './JUnitReport.js';
import { entryScriptFile, type TestFramework, type TestFrameworkKey, type TestFrameworkName, testFrameworks, type TestRunPlan } from './TestFrameworks.js';

export interface TestRunRequest {
  readonly paths: readonly string[];
  readonly testName?: string | undefined;
  readonly framework?: TestFrameworkKey | undefined;
  readonly headless: boolean;
  readonly timeoutMs: number;
}

export interface TestRunResult {
  readonly framework: TestFrameworkName;
  readonly selection: readonly string[];
  readonly cases: readonly TestCaseResult[];
  readonly loadErrors: readonly ScriptErrorEntry[];
  readonly durationMs: number;
}

export interface TestRunnerDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorStatusProvider & EditorGateway;
  readonly locateBinary: () => Promise<BinaryLookup>;
  readonly processRunner: ProcessRunner;
  readonly now: () => number;
}

export class TestRunError extends Error {
  override readonly name = 'TestRunError';
}

interface TestSelection {
  readonly directories: readonly string[];
  readonly scripts: readonly string[];
  readonly description: readonly string[];
}

const resourcePrefix = 'res://';
const defaultTestFolders = ['res://test', 'res://tests'];
const reportsRelativePath = '.godot/godot_mcp_tool/test_reports';
const rescanTimeoutMs = 90_000;
const importTimeoutMs = 300_000;
const outputTailLines = 30;
const loadErrorPattern = /^(?:Parse Error|Compile Error): /;
const ansiEscapePattern = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');

export class TestRunner {
  constructor(private readonly dependencies: TestRunnerDependencies) {}

  async run(request: TestRunRequest): Promise<TestRunResult> {
    const { projectRoot } = this.dependencies;
    if (projectRoot === undefined) {
      throw new TestRunError('No Godot project was found, so there are no tests to run. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const framework = chooseFramework(projectRoot, request.framework);
    if (request.testName !== undefined && !framework.selectsTestsByName) {
      throw new TestRunError(`${framework.name} runs whole test suites, so it cannot pick tests by name. Pass the path of the test suite in paths instead.`);
    }
    const selection = selectTests(projectRoot, framework, request.paths);
    const binary = await this.dependencies.locateBinary();
    if (!binary.found) {
      throw new TestRunError(binary.reason);
    }
    await this.prepareProject(projectRoot, binary.path);
    const reportFolder = `${reportsRelativePath}/${randomUUID()}`;
    const reportDirectory = join(projectRoot, reportFolder);
    mkdirSync(reportDirectory, { recursive: true });
    try {
      const plan: TestRunPlan = {
        directories: selection.directories,
        scripts: selection.scripts,
        testName: request.testName,
        reportDirectory: `${resourcePrefix}${reportFolder}`,
        headless: request.headless,
      };
      const startedAt = this.dependencies.now();
      const result = await this.runFramework(binary.path, projectRoot, framework, plan, request);
      const durationMs = this.dependencies.now() - startedAt;
      const output = withoutColors(`${result.stdout}\n${result.stderr}`);
      const reportFile = framework.findReport(reportDirectory);
      if (reportFile === undefined) {
        throw new TestRunError(`${framework.name} wrote no test report (exit code ${String(result.exitCode)}). The end of its output:\n${lastLines(output)}`);
      }
      return {
        framework: framework.name,
        selection: selection.description,
        cases: readJUnitReport(readFileSync(reportFile, 'utf8')),
        loadErrors: loadErrorsIn(output),
        durationMs,
      };
    } finally {
      rmSync(reportDirectory, { recursive: true, force: true });
    }
  }

  private async runFramework(binaryPath: string, projectRoot: string, framework: TestFramework, plan: TestRunPlan, request: TestRunRequest): Promise<ProcessResult> {
    const args = [...(request.headless ? ['--headless'] : []), '--path', projectRoot, '-s', framework.entryScript, ...framework.commandArguments(plan)];
    try {
      return await this.dependencies.processRunner.run(binaryPath, args, { timeoutMs: request.timeoutMs, cwd: projectRoot });
    } catch (error) {
      if (error instanceof Error && error.message.includes('did not finish within')) {
        throw new TestRunError(`The ${framework.name} run did not finish within ${String(Math.round(request.timeoutMs / 1000))} s; raise timeout_ms, or run fewer tests.`, { cause: error });
      }
      throw error;
    }
  }

  private async prepareProject(projectRoot: string, binaryPath: string): Promise<void> {
    const editorStatus = await this.dependencies.editor.status();
    if (editorStatus.connected) {
      await this.dependencies.editor.request('editor.rescan', {}, { timeoutMs: rescanTimeoutMs }).catch(() => undefined);
      return;
    }
    await this.dependencies.processRunner.run(binaryPath, ['--headless', '--path', projectRoot, '--import'], { timeoutMs: importTimeoutMs }).catch(() => undefined);
  }
}

function chooseFramework(projectRoot: string, requested: TestFrameworkKey | undefined): TestFramework {
  const installed = testFrameworks.filter((framework) => existsSync(entryScriptFile(projectRoot, framework)));
  if (requested !== undefined) {
    const framework = testFrameworks.find((candidate) => candidate.key === requested);
    if (framework === undefined || !installed.includes(framework)) {
      throw new TestRunError(`${framework?.name ?? requested} is not installed in this project (no ${framework?.entryScript ?? 'entry script'}).`);
    }
    return framework;
  }
  const [onlyFramework, otherFramework] = installed;
  if (onlyFramework === undefined) {
    throw new TestRunError('No test framework was found in this project. Install GUT (addons/gut) or gdUnit4 (addons/gdUnit4) from the Asset Library.');
  }
  if (otherFramework !== undefined) {
    throw new TestRunError(`Both ${onlyFramework.name} and ${otherFramework.name} are installed; pass framework: "${onlyFramework.key}" or "${otherFramework.key}".`);
  }
  return onlyFramework;
}

function selectTests(projectRoot: string, framework: TestFramework, paths: readonly string[]): TestSelection {
  if (paths.length > 0) {
    return selectPaths(projectRoot, paths);
  }
  const configurationFile = framework.configurationFile;
  if (configurationFile !== undefined && existsSync(join(projectRoot, configurationFile))) {
    return { directories: [], scripts: [], description: [configurationFile] };
  }
  const folders = defaultTestFolders.filter((folder) => isDirectory(fileOf(projectRoot, folder)));
  if (folders.length === 0) {
    throw new TestRunError(`No test folder was found (${defaultTestFolders.join(' or ')}). Pass paths, such as ["res://test/"].`);
  }
  return { directories: folders, scripts: [], description: folders };
}

function selectPaths(projectRoot: string, paths: readonly string[]): TestSelection {
  const directories: string[] = [];
  const scripts: string[] = [];
  for (const requestedPath of paths) {
    const resourcePath = requestedPath.length > resourcePrefix.length ? requestedPath.replace(/\/+$/, '') : requestedPath;
    const relativePath = resourcePath.slice(resourcePrefix.length);
    if (!resourcePath.startsWith(resourcePrefix) || relativePath.split('/').includes('..')) {
      throw new TestRunError(`"${requestedPath}" is not a path in the project. Test paths look like "res://test/" or "res://test/test_player.gd".`);
    }
    const file = fileOf(projectRoot, resourcePath);
    if (!existsSync(file)) {
      throw new TestRunError(`${resourcePath} does not exist.`);
    }
    if (isDirectory(file)) {
      directories.push(resourcePath);
    } else if (resourcePath.endsWith('.gd')) {
      scripts.push(resourcePath);
    } else {
      throw new TestRunError(`${resourcePath} is neither a folder nor a .gd test script.`);
    }
  }
  return { directories, scripts, description: [...directories, ...scripts] };
}

function fileOf(projectRoot: string, resourcePath: string): string {
  return join(projectRoot, resourcePath.slice(resourcePrefix.length));
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function withoutColors(text: string): string {
  return text.replace(ansiEscapePattern, '');
}

function lastLines(output: string): string {
  return output.trimEnd().split('\n').slice(-outputTailLines).join('\n');
}

function loadErrorsIn(output: string): ScriptErrorEntry[] {
  const seen = new Set<string>();
  return readScriptErrors(output).filter((scriptError) => {
    const key = `${scriptError.file}:${String(scriptError.line)}`;
    if (!loadErrorPattern.test(scriptError.message) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
