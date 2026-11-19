import { join } from 'node:path';
import type { Scenario } from './Scenario.js';

export interface AgentOptions {
  readonly model: string | undefined;
  readonly budgetUsd: number;
  readonly serverUnderTest: readonly string[] | undefined;
  readonly withPlugin: boolean;
}

export interface LocalServer {
  readonly entry: string;
  readonly withoutConfirmationsEntry: string;
}

export interface RunFiles {
  readonly mcpConfig: string;
  readonly stagedPlugin: string;
  readonly debugLog: string;
}

export interface McpServerCommand {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export class SettingError extends Error {
  override readonly name = 'SettingError';
}

export function serverUnderTestFrom(setting: string | undefined): readonly string[] | undefined {
  if (setting === undefined || setting.trim() === '') {
    return undefined;
  }
  const problem = new SettingError(`EVAL_SERVER is a JSON list of the command and its arguments, such as ["uvx", "godot-ai==1.4.0"], not ${setting}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(setting);
  } catch {
    throw problem;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every((part): part is string => typeof part === 'string' && part !== '')) {
    throw problem;
  }
  return parsed;
}

export function withPluginFrom(setting: string | undefined): boolean {
  return setting !== '0';
}

export function mcpServerFor(scenario: Scenario, options: AgentOptions, local: LocalServer, env: Readonly<Record<string, string>>): McpServerCommand {
  if (options.serverUnderTest !== undefined) {
    const [command = '', ...args] = options.serverUnderTest;
    return { command, args, env };
  }
  return { command: process.execPath, args: scenario.unsafeTools === true ? [local.withoutConfirmationsEntry, local.entry] : [local.entry], env };
}

export function agentArgumentsFor(scenario: Scenario, options: AgentOptions, files: RunFiles): string[] {
  return [
    '-p',
    scenario.request,
    '--output-format',
    'stream-json',
    '--verbose',
    '--restricted',
    '--strict-mcp-config',
    '--mcp-config',
    files.mcpConfig,
    ...(options.withPlugin ? ['--plugin-dir', files.stagedPlugin, '--add-dir', join(files.stagedPlugin, 'skills')] : []),
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    'mcp__godot',
    '--max-budget-usd',
    String(options.budgetUsd),
    '--no-session-persistence',
    '--debug-file',
    files.debugLog,
    ...(options.model === undefined ? [] : ['--model', options.model]),
  ];
}
