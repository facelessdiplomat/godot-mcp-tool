import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type AgentOptions, agentArgumentsFor, mcpServerFor, SettingError, serverUnderTestFrom, withPluginFrom } from './AgentInvocation.js';
import type { Scenario } from './Scenario.js';

const scenario = {
  name: 'build-an-arena',
  request: 'Build a small arena.',
  prepare: () => Promise.resolve(),
  solve: () => Promise.resolve(),
  check: () => Promise.resolve([]),
} satisfies Scenario;

const local = { entry: '/checkout/server/dist/index.js', withoutConfirmationsEntry: '/checkout/server/test/evals/serverWithoutConfirmations.ts' };
const files = { mcpConfig: '/runs/1/mcp.json', stagedPlugin: '/runs/1/plugin', debugLog: '/runs/1/claude-debug.log' };
const environment = { GODOT_PROJECT_PATH: '/projects/arena', GODOT_BIN: '/godot' };
const ourServerWithPlugin: AgentOptions = { model: undefined, budgetUsd: 5, serverUnderTest: undefined, withPlugin: true };

describe('the agent run of a scenario', () => {
  it('runs this server with its plugin by default', () => {
    const arguments_ = agentArgumentsFor(scenario, ourServerWithPlugin, files);

    expect(mcpServerFor(scenario, ourServerWithPlugin, local, environment)).toEqual({ command: process.execPath, args: [local.entry], env: environment });
    expect(arguments_.slice(0, 2)).toEqual(['-p', 'Build a small arena.']);
    expect(arguments_.join(' ')).toContain(`--plugin-dir ${files.stagedPlugin} --add-dir ${join(files.stagedPlugin, 'skills')}`);
    expect(arguments_.join(' ')).toContain('--mcp-config /runs/1/mcp.json');
    expect(arguments_).not.toContain('--model');
  });

  it('starts this server through the wrapper that answers confirmations when the scenario needs the unsafe tools', () => {
    expect(mcpServerFor({ ...scenario, unsafeTools: true }, ourServerWithPlugin, local, environment).args).toEqual([local.withoutConfirmationsEntry, local.entry]);
  });

  it('runs the server that the setting names, and the agent alone when the plugin is left out', () => {
    const otherServerAlone: AgentOptions = { model: 'opus', budgetUsd: 2, serverUnderTest: ['uvx', 'godot-ai==1.4.0'], withPlugin: false };

    const arguments_ = agentArgumentsFor({ ...scenario, unsafeTools: true }, otherServerAlone, files);

    expect(mcpServerFor({ ...scenario, unsafeTools: true }, otherServerAlone, local, environment)).toEqual({ command: 'uvx', args: ['godot-ai==1.4.0'], env: environment });
    expect(arguments_).not.toContain('--plugin-dir');
    expect(arguments_).not.toContain('--add-dir');
    expect(arguments_.join(' ')).toContain('--max-budget-usd 2');
    expect(arguments_.slice(-2)).toEqual(['--model', 'opus']);
  });

  it('reads the server under test as a JSON list of the command and its arguments', () => {
    expect(serverUnderTestFrom('["uvx", "godot-ai==1.4.0"]')).toEqual(['uvx', 'godot-ai==1.4.0']);
    expect(serverUnderTestFrom(undefined)).toBeUndefined();
    expect(serverUnderTestFrom(' ')).toBeUndefined();
    expect(() => serverUnderTestFrom('uvx godot-ai')).toThrow(
      new SettingError('EVAL_SERVER is a JSON list of the command and its arguments, such as ["uvx", "godot-ai==1.4.0"], not uvx godot-ai'),
    );
    expect(() => serverUnderTestFrom('[]')).toThrow(SettingError);
  });

  it('keeps the plugin unless the setting is 0', () => {
    expect(withPluginFrom(undefined)).toBe(true);
    expect(withPluginFrom('1')).toBe(true);
    expect(withPluginFrom('0')).toBe(false);
  });
});
