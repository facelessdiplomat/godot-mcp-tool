import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findFreePort, godotBinary, McpSession, startHeadlessEditor, startWindowedEditor, TemporaryProject, waitFor } from '../integration/harness.js';
import { type AgentRun, readAgentRun } from './AgentRun.js';
import type { CheckResult, PrepareContext, Scenario, Solution } from './Scenario.js';
import { stagePlugin } from './StagedPlugin.js';

export interface EvalSettings {
  readonly claudeBinary: string;
  readonly model: string | undefined;
  readonly budgetUsd: number;
  readonly agentTimeoutMs: number;
  readonly resultsDirectory: string;
}

export interface EvalResult {
  readonly scenario: string;
  readonly startedAt: string;
  readonly passed: boolean;
  readonly checks: readonly CheckResult[];
  readonly toolCallCount: number;
  readonly agent: AgentRun;
}

interface ScenarioWorkspace {
  readonly project: TemporaryProject;
  readonly variables: Readonly<Record<string, string>>;
  readonly stopEditor: () => Promise<void>;
}

const unsafeToolsMetadata = ['[godot_mcp_tool]', '', 'allow_unsafe_tools=true', ''].join('\n');

const repositoryRoot = join(import.meta.dirname, '..', '..', '..');
const serverEntry = join(repositoryRoot, 'server', 'dist', 'index.js');
const pluginDirectory = join(repositoryRoot, 'plugin');
const serverWithoutConfirmationsEntry = join(import.meta.dirname, 'serverWithoutConfirmations.ts');

export async function runScenario(scenario: Scenario, settings: EvalSettings): Promise<EvalResult> {
  const startedAt = new Date().toISOString();
  const runDirectory = join(settings.resultsDirectory, `${startedAt.replace(/[:.]/g, '-')}-${scenario.name}`);
  mkdirSync(runDirectory, { recursive: true });
  return inWorkspace(scenario, async ({ project, variables, stopEditor }) => {
    await withTools(project, variables, (context) => scenario.prepare(context));
    if (scenario.editorDuringRun === false) {
      await stopEditor();
    }
    const agent = readAgentRun(await runAgent(scenario, project.root, variables, runDirectory, settings));
    const checks = await withTools(project, variables, (context) => scenario.check({ ...context, agent }));
    const result: EvalResult = {
      scenario: scenario.name,
      startedAt,
      passed: checks.every((check) => check.passed),
      checks,
      toolCallCount: Object.values(agent.toolCalls).reduce((total, count) => total + count, 0),
      agent,
    };
    writeFileSync(join(runDirectory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  });
}

export function runReferenceSolution(scenario: Scenario, solve: Solution): Promise<CheckResult[]> {
  return inWorkspace(scenario, async ({ project, variables, stopEditor }) => {
    await withTools(project, variables, (context) => scenario.prepare(context));
    if (scenario.editorDuringRun === false) {
      await stopEditor();
    }
    await withTools(project, variables, solve);
    return withTools(project, variables, (context) => scenario.check({ ...context, agent: undefined }));
  });
}

async function inWorkspace<T>(scenario: Scenario, work: (workspace: ScenarioWorkspace) => Promise<T>): Promise<T> {
  const project = new TemporaryProject(`Eval ${scenario.name}`, scenario.projectOptions);
  if (scenario.unsafeTools === true) {
    mkdirSync(project.path('.godot/editor'), { recursive: true });
    project.write('.godot/editor/project_metadata.cfg', unsafeToolsMetadata);
  }
  const ports = { languageServer: await findFreePort(), debugAdapter: await findFreePort() };
  const variables = {
    GODOT_BIN: godotBinary,
    GODOT_LSP_PORT: String(ports.languageServer),
    GODOT_DAP_PORT: String(ports.debugAdapter),
    ...(scenario.unsafeTools === true ? { GODOT_MCP_UNSAFE: '1' } : {}),
    ...scenario.serverVariables,
  };
  const editor = scenario.window === true ? await startWindowedEditor(project.root, ports) : await startHeadlessEditor(project.root, ports);
  try {
    return await work({ project, variables, stopEditor: () => stopProcess(editor) });
  } finally {
    editor.kill('SIGKILL');
    project.remove();
  }
}

async function stopProcess(child: ChildProcess): Promise<void> {
  child.kill('SIGKILL');
  await waitFor(() => child.exitCode !== null || child.signalCode !== null, 10_000);
}

async function withTools<T>(project: TemporaryProject, variables: Readonly<Record<string, string>>, work: (context: PrepareContext) => Promise<T>): Promise<T> {
  const tools = await McpSession.connect(project.root, variables);
  try {
    return await work({ project, tools });
  } finally {
    await tools.call('game_stop');
    await tools.close();
  }
}

function runAgent(scenario: Scenario, projectRoot: string, variables: Readonly<Record<string, string>>, runDirectory: string, settings: EvalSettings): Promise<string> {
  const stagedPlugin = join(runDirectory, 'plugin');
  stagePlugin(pluginDirectory, stagedPlugin, serverEntry);
  const mcpConfig = join(runDirectory, 'mcp.json');
  const serverArguments = scenario.unsafeTools === true ? [serverWithoutConfirmationsEntry, serverEntry] : [serverEntry];
  const server = { command: process.execPath, args: serverArguments, env: { GODOT_PROJECT_PATH: projectRoot, ...variables } };
  writeFileSync(mcpConfig, `${JSON.stringify({ mcpServers: { godot: server } }, null, 2)}\n`);
  const agentArguments = [
    '-p',
    scenario.request,
    '--output-format',
    'stream-json',
    '--verbose',
    '--restricted',
    '--strict-mcp-config',
    '--mcp-config',
    mcpConfig,
    '--plugin-dir',
    stagedPlugin,
    '--add-dir',
    join(stagedPlugin, 'skills'),
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'mcp__godot',
    '--max-budget-usd',
    String(settings.budgetUsd),
    '--no-session-persistence',
    '--debug-file',
    join(runDirectory, 'claude-debug.log'),
    ...(settings.model === undefined ? [] : ['--model', settings.model]),
  ];
  return new Promise((resolve, reject) => {
    const agent = spawn(settings.claudeBinary, agentArguments, { cwd: projectRoot, env: { ...process.env, ...variables }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stream = '';
    let errors = '';
    agent.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stream += chunk;
    });
    agent.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      errors += chunk;
    });
    const timer = setTimeout(() => agent.kill('SIGTERM'), settings.agentTimeoutMs);
    agent.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    agent.on('close', () => {
      clearTimeout(timer);
      writeFileSync(join(runDirectory, 'agent.jsonl'), stream);
      writeFileSync(join(runDirectory, 'agent-stderr.log'), errors);
      resolve(stream);
    });
  });
}
