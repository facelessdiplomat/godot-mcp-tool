import { describe, expect, it } from 'vitest';
import { readAgentRun } from './AgentRun.js';

const streamLines = [
  { type: 'system', subtype: 'init', model: 'claude-opus-5-5', mcp_servers: [{ name: 'godot', status: 'connected' }] },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Checking the editor first.' },
        { type: 'tool_use', id: 'toolu_1', name: 'mcp__godot__godot_status', input: {} },
      ],
    },
  },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text: 'Editor: connected.' }] }] } },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'toolu_2', name: 'Write', input: { file_path: '/game/enemy.gd' } },
        { type: 'tool_use', id: 'toolu_3', name: 'mcp__godot__game_wait', input: {} },
      ],
    },
  },
  {
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_2', content: 'File written.' },
        { type: 'tool_result', tool_use_id: 'toolu_3', content: 'The condition did not become true within 5000 ms.', is_error: true },
      ],
    },
  },
  {
    type: 'result',
    subtype: 'success',
    is_error: false,
    num_turns: 4,
    duration_ms: 95_000,
    total_cost_usd: 1.25,
    result: 'The enemy now patrols between the markers.',
    usage: { input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 250_000, cache_creation_input_tokens: 40_000 },
  },
];

describe('reading the stream of an agent run', () => {
  it('counts the tool calls, their failures, the turns, the tokens and the cost', () => {
    const run = readAgentRun([...streamLines.map((line) => JSON.stringify(line)), 'not json', ''].join('\n'));

    expect(run).toEqual({
      model: 'claude-opus-5-5',
      ended: 'success',
      turns: 4,
      toolCalls: { mcp__godot__godot_status: 1, Write: 1, mcp__godot__game_wait: 1 },
      failedToolCalls: 1,
      inputTokens: 1200,
      outputTokens: 3400,
      cacheReadTokens: 250_000,
      cacheCreationTokens: 40_000,
      costUsd: 1.25,
      durationMs: 95_000,
      finalMessage: 'The enemy now patrols between the markers.',
    });
  });

  it('tells a run that Claude Code refused before any work', () => {
    const refused = readAgentRun(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, num_turns: 1, total_cost_usd: 0, result: 'Not logged in · Please run /login' }));

    expect(refused).toMatchObject({ ended: 'error', finalMessage: 'Not logged in · Please run /login', toolCalls: {} });
  });

  it('tells a run that stopped on an error or never finished', () => {
    const failed = readAgentRun(JSON.stringify({ type: 'result', subtype: 'error_max_budget_usd', is_error: true, num_turns: 9, total_cost_usd: 5.01 }));
    const unfinished = readAgentRun(JSON.stringify(streamLines[0]));

    expect(failed).toMatchObject({ ended: 'error_max_budget_usd', turns: 9, costUsd: 5.01 });
    expect(unfinished).toMatchObject({ ended: 'unfinished', model: 'claude-opus-5-5', toolCalls: {}, costUsd: undefined });
  });
});
