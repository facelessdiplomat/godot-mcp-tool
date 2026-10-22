import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EditorStatus } from '../../src/bridge/EditorConnection.js';
import type { ProcessResult, ProcessRunOptions, ProcessRunner } from '../../src/process/ProcessRunner.js';
import { TestRunError, TestRunner, type TestRunnerDependencies, type TestRunRequest } from '../../src/testing/TestRunner.js';

const gutReport = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<testsuites name="GutTests" failures="1" tests="2" >',
  '  <testsuite name="test/test_player.gd" tests="2" failures="1" skipped="0" time="0.01" >',
  '      <testcase name="test_walks" assertions="1" status="pass" classname="test/test_player.gd" time="0.001" >',
  '      </testcase>',
  '      <testcase name="test_dashes" assertions="1" status="fail" classname="test/test_player.gd" time="0.001" >',
  '      <failure message="failed"><![CDATA[[2] expected to equal [3]',
  '            at line 9]]></failure></testcase>',
  '  </testsuite>',
  '</testsuites>',
].join('\n');

const gdUnitReport = [
  '<?xml version="1.0" encoding="UTF-8" ?>',
  '<testsuites id="2026-10-22" name="report_1" tests="1" failures="0" skipped="0" flaky="0" time="0.000">',
  '\t<testsuite id="0" name="player_test" package="test" tests="1" failures="0" errors="0" skipped="0" flaky="0" time="0.005">',
  '\t\t<testcase name="test_walks" classname="player_test" time="0.002">',
  '\t\t</testcase>',
  '\t</testsuite>',
  '</testsuites>',
].join('\n');

interface RecordedRun {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: ProcessRunOptions;
}

class FakeProcessRunner implements ProcessRunner {
  readonly runs: RecordedRun[] = [];
  report: string | undefined = gutReport;
  output = '';
  exitCode = 0;
  failure: Error | undefined;

  constructor(private readonly projectRoot: () => string) {}

  run(command: string, args: readonly string[], options: ProcessRunOptions): Promise<ProcessResult> {
    this.runs.push({ command, args, options });
    if (args.includes('--import')) {
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    }
    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }
    if (this.report !== undefined) {
      writeReport(this.report, this.reportFileFor(args));
    }
    return Promise.resolve({ exitCode: this.exitCode, stdout: this.output, stderr: '' });
  }

  get testRun(): RecordedRun | undefined {
    return this.runs.find((run) => !run.args.includes('--import'));
  }

  private reportFileFor(args: readonly string[]): string {
    const gutFile = args.find((arg) => arg.startsWith('-gjunit_xml_file='))?.slice('-gjunit_xml_file='.length);
    if (gutFile !== undefined) {
      return this.absolute(gutFile);
    }
    const directory = args[args.indexOf('-rd') + 1] ?? '';
    return join(this.absolute(directory), 'report_1', 'results.xml');
  }

  private absolute(resourcePath: string): string {
    return join(this.projectRoot(), resourcePath.slice('res://'.length));
  }
}

function writeReport(content: string, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const connected: EditorStatus = {
  connected: true,
  hello: { protocol: 1, godotVersion: '4.8', addonVersion: '0.1.0', projectPath: '/game', executablePath: '/opt/godot', methods: [] },
};
const notConnected: EditorStatus = { connected: false, reason: 'The Godot editor is not running for this project.' };

describe('TestRunner', () => {
  let projectRoot = '';
  let processes: FakeProcessRunner;
  let editorStatus: EditorStatus;
  let editorRequests: string[];
  let clockMs: number;

  function install(entryScript: string): void {
    writeReport('extends SceneTree\n', join(projectRoot, entryScript));
  }

  function testRunner(overrides: Partial<TestRunnerDependencies> = {}): TestRunner {
    return new TestRunner({
      projectRoot,
      editor: {
        status: () => Promise.resolve(editorStatus),
        request: (method) => {
          editorRequests.push(method);
          return Promise.resolve({ duration_ms: 5 });
        },
      },
      locateBinary: () => Promise.resolve({ found: true, path: '/opt/godot', source: 'GODOT_BIN' }),
      processRunner: processes,
      now: () => (clockMs += 250),
      ...overrides,
    });
  }

  function request(overrides: Partial<TestRunRequest> = {}): TestRunRequest {
    return { paths: [], headless: true, timeoutMs: 60_000, ...overrides };
  }

  beforeEach(() => {
    projectRoot = realpathSync(mkdtempSync(join(tmpdir(), 'test-runner-')));
    processes = new FakeProcessRunner(() => projectRoot);
    editorStatus = notConnected;
    editorRequests = [];
    clockMs = 0;
    install('addons/gut/gut_cmdln.gd');
    mkdirSync(join(projectRoot, 'test'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('imports the project, runs GUT on the test folder and reads its report', async () => {
    const result = await testRunner().run(request());

    expect(processes.runs[0]?.args).toEqual(['--headless', '--path', projectRoot, '--import']);
    expect(processes.testRun?.args).toEqual([
      '--headless',
      '--path',
      projectRoot,
      '-s',
      'res://addons/gut/gut_cmdln.gd',
      '-gexit',
      '-gdisable_colors',
      expect.stringMatching(/^-gjunit_xml_file=res:\/\/\.godot\/godot_mcp_tool\/test_reports\/[\w-]+\/gut\.xml$/),
      '-gdir=res://test',
      '-ginclude_subdirs',
    ]);
    expect(processes.testRun?.options).toEqual({ timeoutMs: 60_000, cwd: projectRoot });
    expect(result).toEqual({
      framework: 'GUT',
      selection: ['res://test'],
      durationMs: 250,
      loadErrors: [],
      cases: [
        { suite: 'res://test/test_player.gd', name: 'test_walks', status: 'passed' },
        { suite: 'res://test/test_player.gd', name: 'test_dashes', status: 'failed', location: 'res://test/test_player.gd:9', message: '[2] expected to equal [3]' },
      ],
    });
    expect(readdirSync(join(projectRoot, '.godot', 'godot_mcp_tool', 'test_reports'))).toEqual([]);
  });

  it('lets the connected editor rescan the project instead of importing it, and hears from it after the run', async () => {
    editorStatus = connected;

    await testRunner().run(request());

    expect(editorRequests).toEqual(['editor.rescan', 'ping']);
    expect(processes.runs.some((run) => run.args.includes('--import'))).toBe(false);
  });

  it('reports the run when the editor does not answer after it', async () => {
    editorStatus = connected;
    const runner = testRunner({
      editor: {
        status: () => Promise.resolve(editorStatus),
        request: (method) => (method === 'ping' ? Promise.reject(new Error('The editor disconnected')) : Promise.resolve({ duration_ms: 5 })),
      },
    });

    const result = await runner.run(request());

    expect(result.cases).toHaveLength(2);
  });

  it('runs chosen folders, scripts and tests by name with GUT, with a window on request', async () => {
    mkdirSync(join(projectRoot, 'test', 'unit'));
    writeFileSync(join(projectRoot, 'test', 'test_player.gd'), 'extends GutTest\n');

    await testRunner().run(request({ paths: ['res://test/unit/', 'res://test/test_player.gd'], testName: 'dash', headless: false }));

    expect(processes.testRun?.args.slice(0, 4)).toEqual(['--path', projectRoot, '-s', 'res://addons/gut/gut_cmdln.gd']);
    expect(processes.testRun?.args.slice(-4)).toEqual(['-gdir=res://test/unit', '-ginclude_subdirs', '-gtest=res://test/test_player.gd', '-gunit_test_name=dash']);
  });

  it('leaves the choice of tests to .gutconfig.json when no paths are given', async () => {
    writeFileSync(join(projectRoot, '.gutconfig.json'), '{"dirs": ["res://specs"]}');

    const result = await testRunner().run(request());

    expect(processes.testRun?.args.some((arg) => arg.startsWith('-gdir') || arg.startsWith('-gtest'))).toBe(false);
    expect(result.selection).toEqual(['.gutconfig.json']);
  });

  it('runs gdUnit4 test suites and reads its report', async () => {
    rmSync(join(projectRoot, 'addons', 'gut'), { recursive: true });
    install('addons/gdUnit4/bin/GdUnitCmdTool.gd');
    processes.report = gdUnitReport;

    const result = await testRunner().run(request({ paths: ['res://test'] }));

    expect(processes.testRun?.args).toEqual([
      '--headless',
      '--path',
      projectRoot,
      '-s',
      'res://addons/gdUnit4/bin/GdUnitCmdTool.gd',
      '--ignoreHeadlessMode',
      '-c',
      '-rd',
      expect.stringMatching(/^res:\/\/\.godot\/godot_mcp_tool\/test_reports\/[\w-]+$/),
      '-a',
      'res://test',
    ]);
    expect(result.framework).toBe('gdUnit4');
    expect(result.cases).toEqual([{ suite: 'res://test/player_test.gd', name: 'test_walks', status: 'passed' }]);
  });

  it('explains what it needs before running anything', async () => {
    await expect(testRunner({ projectRoot: undefined }).run(request())).rejects.toThrow('GODOT_PROJECT_PATH');
    await expect(testRunner().run(request({ paths: ['res://missing/'] }))).rejects.toThrow('res://missing does not exist');
    await expect(testRunner().run(request({ paths: ['res://../outside'] }))).rejects.toThrow('is not a path in the project');
    await expect(testRunner().run(request({ framework: 'gdunit4' }))).rejects.toThrow('gdUnit4 is not installed');
    install('addons/gdUnit4/bin/GdUnitCmdTool.gd');
    await expect(testRunner().run(request())).rejects.toThrow('Both GUT and gdUnit4 are installed');
    await expect(testRunner().run(request({ framework: 'gdunit4', testName: 'dash' }))).rejects.toThrow('whole test suites');
    rmSync(join(projectRoot, 'addons'), { recursive: true });
    await expect(testRunner().run(request())).rejects.toThrow('No test framework');
    expect(processes.runs).toEqual([]);
  });

  it('needs a test folder when no paths are given', async () => {
    rmSync(join(projectRoot, 'test'), { recursive: true });

    await expect(testRunner().run(request())).rejects.toThrow('No test folder');
  });

  it('shows the end of the output when the framework wrote no report', async () => {
    processes.report = undefined;
    processes.exitCode = 1;
    processes.output = ['Godot Engine v4.8', ...Array.from({ length: 40 }, (_, index) => `\u001b[31mline ${String(index + 1)}\u001b[0m`)].join('\n');

    const running = testRunner().run(request());

    await expect(running).rejects.toThrow(TestRunError);
    await expect(running).rejects.toThrow(/GUT wrote no test report \(exit code 1\)\. The end of its output:\nline 11\n[\s\S]*line 40$/);
  });

  it('lists the test scripts that failed to load', async () => {
    processes.output = [
      'SCRIPT ERROR: Parse Error: Identifier "SPED" not declared in the current scope.',
      '          at: GDScript::reload (res://test/test_enemy.gd:12)',
      "SCRIPT ERROR: Invalid access to property or key 'speed' on a base object of type 'Nil'.",
      '          at: test_walks (res://test/test_player.gd:30)',
    ].join('\n');

    const result = await testRunner().run(request());

    expect(result.loadErrors).toEqual([{ file: 'res://test/test_enemy.gd', line: 12, message: 'Parse Error: Identifier "SPED" not declared in the current scope.' }]);
  });

  it('explains a run that did not finish in time', async () => {
    processes.failure = new Error('/opt/godot did not finish within 60000 ms');

    await expect(testRunner().run(request())).rejects.toThrow('did not finish within 60 s; raise timeout_ms');
    expect(existsSync(join(projectRoot, '.godot', 'godot_mcp_tool', 'test_reports'))).toBe(true);
    expect(readdirSync(join(projectRoot, '.godot', 'godot_mcp_tool', 'test_reports'))).toEqual([]);
  });
});
