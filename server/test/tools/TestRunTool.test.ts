import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import type { TestCaseResult } from '../../src/testing/JUnitReport.js';
import { TestRunError, type TestRunRequest, type TestRunResult } from '../../src/testing/TestRunner.js';
import { TestRunTool } from '../../src/tools/TestRunTool.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

function runnerAnswering(outcome: TestRunResult | Error): { readonly requests: TestRunRequest[]; run(request: TestRunRequest): Promise<TestRunResult> } {
  const requests: TestRunRequest[] = [];
  return {
    requests,
    run: (request) => {
      requests.push(request);
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
    },
  };
}

function passed(suite: string, name: string): TestCaseResult {
  return { suite, name, status: 'passed' };
}

const run: TestRunResult = {
  framework: 'GUT',
  selection: ['res://test'],
  durationMs: 1260,
  loadErrors: [],
  cases: [
    passed('res://test/test_player.gd', 'test_walks'),
    { suite: 'res://test/test_player.gd', name: 'test_dashes', status: 'failed', location: 'res://test/test_player.gd:9', message: '[2] expected to equal [3]:  dash distance' },
    { suite: 'res://test/test_enemy.gd', name: 'test_patrols', status: 'skipped', message: 'not written yet' },
    passed('res://test/test_enemy.gd', 'test_chases'),
  ],
};

describe('test_run', () => {
  it('runs the default tests and lists the failures with their places', async () => {
    const runner = runnerAnswering(run);

    const result = await new TestRunTool(runner).execute({});

    expect(runner.requests).toEqual([{ paths: [], headless: true, timeoutMs: 300_000 }]);
    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toBe(
      [
        'Ran 4 tests in 2 scripts with GUT (res://test, 1.3 s): 2 passed, 1 failed, 1 skipped.',
        'Failed:',
        '- test_dashes (res://test/test_player.gd:9)',
        '  [2] expected to equal [3]:  dash distance',
        'Skipped:',
        '- test_patrols (res://test/test_enemy.gd): not written yet',
      ].join('\n'),
    );
  });

  it('passes the chosen tests on', async () => {
    const runner = runnerAnswering(run);

    await new TestRunTool(runner).execute({ paths: ['res://test/test_player.gd'], name: 'dash', framework: 'gut', headless: false, timeout_ms: 60_000 });

    expect(runner.requests).toEqual([{ paths: ['res://test/test_player.gd'], testName: 'dash', framework: 'gut', headless: false, timeoutMs: 60_000 }]);
  });

  it('says briefly when every test passed', async () => {
    const result = await new TestRunTool(runnerAnswering({ ...run, cases: [passed('res://test/test_player.gd', 'test_walks')] })).execute({});

    expect(textOf(result)).toBe('Ran 1 test in 1 script with GUT (res://test, 1.3 s): all passed.');
  });

  it('explains how the framework finds tests when it found none', async () => {
    const result = await new TestRunTool(runnerAnswering({ ...run, framework: 'gdUnit4', cases: [] })).execute({});

    expect(textOf(result)).toBe('gdUnit4 found no tests in res://test. gdUnit4 runs scripts that extend GdUnitTestSuite.');
  });

  it('lists test scripts that failed to load', async () => {
    const result = await new TestRunTool(
      runnerAnswering({ ...run, cases: [passed('res://test/test_player.gd', 'test_walks')], loadErrors: [{ file: 'res://test/test_enemy.gd', line: 12, message: 'Parse Error: Unexpected "Indent".' }] }),
    ).execute({});

    expect(textOf(result)).toBe(
      [
        'Ran 1 test in 1 script with GUT (res://test, 1.3 s): all passed.',
        'Test scripts that failed to load, so their tests did not run:',
        '- res://test/test_enemy.gd:12: Parse Error: Unexpected "Indent".',
      ].join('\n'),
    );
  });

  it('shortens long failure messages and long lists', async () => {
    const longMessage = Array.from({ length: 20 }, (_, index) => `line ${String(index + 1)}`).join('\n');
    const failures: TestCaseResult[] = Array.from({ length: 23 }, (_, index) => ({
      suite: 'res://test/test_many.gd',
      name: `test_${String(index + 1)}`,
      status: 'failed',
      location: `res://test/test_many.gd:${String(index + 1)}`,
      message: index === 0 ? longMessage : 'boom',
    }));

    const text = textOf(await new TestRunTool(runnerAnswering({ ...run, cases: failures })).execute({}));

    expect(text).toContain('  line 12\n  …\n- test_2 (res://test/test_many.gd:2)');
    expect(text).toContain('- test_20 (res://test/test_many.gd:20)\n  boom\n… and 3 more failed tests.');
  });

  it('reports why the tests could not run', async () => {
    const result = await new TestRunTool(runnerAnswering(new TestRunError('No test framework was found in this project.'))).execute({});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('No test framework was found in this project.');
  });
});
