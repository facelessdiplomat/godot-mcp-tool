import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { ErrorDismissal } from '../runtime/ErrorSummary.js';
import { isLoadErrorOf } from '../scripts/ScriptLoadErrors.js';
import type { TestCaseResult } from '../testing/JUnitReport.js';
import { testFrameworks } from '../testing/TestFrameworks.js';
import { TestRunError, type TestRunRequest, type TestRunResult } from '../testing/TestRunner.js';
import { changingAnnotations } from './annotations.js';
import { counted } from './formatting/counting.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface TestRunService {
  run(request: TestRunRequest): Promise<TestRunResult>;
}

const testRunInput = z.object({
  paths: z
    .array(z.string().min(1))
    .default([])
    .describe(
      'Test folders or scripts to run, as res:// paths, such as ["res://test/"] or ["res://test/test_player.gd"]. Default: res://test and res://tests, or the folders that .gutconfig.json names.',
    ),
  name: z.string().min(1).optional().describe('Run only the tests whose names contain this text, such as "dash". GUT only: gdUnit4 runs whole test suites.'),
  framework: z.enum(['gut', 'gdunit4']).optional().describe('The test framework, needed only when the project has both GUT and gdUnit4 in addons/.'),
  headless: z
    .boolean()
    .default(true)
    .describe('Run without a window. Set false for tests that need rendering or real input events; a window opens while they run.'),
  timeout_ms: z.number().int().min(1000).max(1_800_000).default(300_000).describe('Stop the run after this many milliseconds.'),
});

const failuresShown = 20;
const skippedShown = 10;
const messageLinesShown = 12;

export class TestRunTool implements Tool<typeof testRunInput> {
  readonly name = 'test_run';

  readonly definition: ToolDefinition<typeof testRunInput> = {
    title: 'Run tests',
    description:
      "Run the project's GUT or gdUnit4 tests in a separate Godot process and report the result: how many passed, failed and were skipped, each failure with its file, line and message, and test scripts that failed to load. Tests load scenes and resources from disk, so save changes first with scene_save. Works without the editor.",
    inputSchema: testRunInput,
    annotations: changingAnnotations({ destructive: false, idempotent: true }),
    alwaysLoad: false,
  };

  constructor(
    private readonly runner: TestRunService,
    private readonly editorErrors: ErrorDismissal,
  ) {}

  async execute(input: z.input<typeof testRunInput>): Promise<CallToolResult> {
    const parsedInput = testRunInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    const { paths, name, framework, headless, timeout_ms: timeoutMs } = parsedInput.data;
    try {
      const result = await this.runner.run({
        paths,
        ...(name === undefined ? {} : { testName: name }),
        ...(framework === undefined ? {} : { framework }),
        headless,
        timeoutMs,
      });
      this.editorErrors.dismiss(isLoadErrorOf(result.loadErrors.map((loadError) => loadError.file)));
      return textResult(describeTestRun(result));
    } catch (error) {
      if (error instanceof TestRunError) {
        return errorResult(error.message);
      }
      throw error;
    }
  }
}

function describeTestRun(result: TestRunResult): string {
  const lines = [summaryOf(result)];
  const failed = result.cases.filter((testCase) => testCase.status === 'failed');
  if (failed.length > 0) {
    lines.push('Failed:', ...failed.slice(0, failuresShown).flatMap(describeFailure));
    if (failed.length > failuresShown) {
      lines.push(`… and ${String(failed.length - failuresShown)} more failed tests.`);
    }
  }
  const skipped = result.cases.filter((testCase) => testCase.status === 'skipped');
  if (skipped.length > 0) {
    lines.push('Skipped:', ...skipped.slice(0, skippedShown).map(describeSkipped));
    if (skipped.length > skippedShown) {
      lines.push(`… and ${String(skipped.length - skippedShown)} more skipped tests.`);
    }
  }
  if (result.loadErrors.length > 0) {
    lines.push(
      'Test scripts that failed to load, so their tests did not run:',
      ...result.loadErrors.map((loadError) => `- ${loadError.file}:${String(loadError.line)}: ${loadError.message}`),
    );
  }
  return lines.join('\n');
}

function summaryOf(result: TestRunResult): string {
  const where = result.selection.join(', ');
  const unloadedScriptCount = new Set(result.loadErrors.map((loadError) => loadError.file)).size;
  const unloaded = `${counted(unloadedScriptCount, 'test script')} failed to load`;
  if (result.cases.length === 0) {
    if (unloadedScriptCount > 0) {
      return `No tests ran with ${result.framework} in ${where}: ${unloaded}.`;
    }
    const convention = testFrameworks.find((framework) => framework.name === result.framework)?.testConvention ?? '';
    return `${result.framework} found no tests in ${where}. ${convention}`.trimEnd();
  }
  const scriptCount = new Set(result.cases.map((testCase) => testCase.suite)).size;
  const seconds = (result.durationMs / 1000).toFixed(1);
  const outcomes = unloadedScriptCount > 0 ? `${outcomesOf(result.cases)}; ${unloaded}` : outcomesOf(result.cases);
  return `Ran ${counted(result.cases.length, 'test')} in ${counted(scriptCount, 'script')} with ${result.framework} (${where}, ${seconds} s): ${outcomes}.`;
}

function outcomesOf(cases: readonly TestCaseResult[]): string {
  const passedCount = cases.filter((testCase) => testCase.status === 'passed').length;
  if (passedCount === cases.length) {
    return 'all passed';
  }
  const failedCount = cases.filter((testCase) => testCase.status === 'failed').length;
  const skippedCount = cases.length - passedCount - failedCount;
  const outcomes = [`${String(passedCount)} passed`];
  if (failedCount > 0) {
    outcomes.push(`${String(failedCount)} failed`);
  }
  if (skippedCount > 0) {
    outcomes.push(`${String(skippedCount)} skipped`);
  }
  return outcomes.join(', ');
}

function describeFailure(testCase: TestCaseResult): string[] {
  const lines = [`- ${testCase.name} (${testCase.location ?? testCase.suite})`];
  const messageLines = (testCase.message ?? '').split('\n').filter((line) => line.trim() !== '');
  lines.push(...messageLines.slice(0, messageLinesShown).map((line) => `  ${line}`));
  if (messageLines.length > messageLinesShown) {
    lines.push('  …');
  }
  return lines;
}

function describeSkipped(testCase: TestCaseResult): string {
  const place = testCase.location ?? testCase.suite;
  return testCase.message === undefined ? `- ${testCase.name} (${place})` : `- ${testCase.name} (${place}): ${testCase.message}`;
}
