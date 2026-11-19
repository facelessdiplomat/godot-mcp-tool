import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { godotBinary } from '../integration/harness.js';
import { serverUnderTestFrom, withPluginFrom } from './AgentInvocation.js';
import { runReferenceSolution, runScenario } from './runScenario.js';
import type { Solution } from './Scenario.js';
import { allScenarios } from './scenarios/allScenarios.js';

const claudeBinary = process.env['CLAUDE_BIN'] ?? '';
const referenceOnly = process.env['EVAL_REFERENCE'] === '1';
const unsolvedOnly = process.env['EVAL_UNSOLVED'] === '1';
const selectedNames = (process.env['EVAL_SCENARIOS'] ?? '').split(',').filter((name) => name !== '');
const scenarios = allScenarios.filter((scenario) => selectedNames.length === 0 || selectedNames.includes(scenario.name));
const agentTimeoutMs = 40 * 60_000;
const referenceTimeoutMs = 5 * 60_000;

describe.skipIf(godotBinary === '' || !referenceOnly)('the reference solutions of the evaluation scenarios', () => {
  for (const scenario of scenarios) {
    const solutions: [string, Solution][] = [['', (context) => scenario.solve(context)], ...Object.entries(scenario.otherSolutions ?? {})];
    for (const [way, solve] of solutions) {
      it(
        `${scenario.name} passes its checks when solved${way === '' ? '' : ` ${way}`}`,
        async () => {
          const checks = await runReferenceSolution(scenario, solve);

          expect(checks.filter((check) => !check.passed)).toEqual([]);
          expect(checks.length).toBeGreaterThan(0);
        },
        referenceTimeoutMs,
      );
    }
  }
});

describe.skipIf(godotBinary === '' || !unsolvedOnly)('the evaluation scenarios left unsolved', () => {
  for (const scenario of scenarios) {
    it(
      `${scenario.name} fails a check when nothing is done`,
      async () => {
        const checks = await runReferenceSolution(scenario, () => Promise.resolve());

        expect(checks.filter((check) => !check.passed)).not.toEqual([]);
      },
      referenceTimeoutMs,
    );
  }
});

describe.skipIf(godotBinary === '' || claudeBinary === '' || referenceOnly || unsolvedOnly)('evaluation scenarios', () => {
  for (const scenario of scenarios) {
    it(
      scenario.name,
      async () => {
        const result = await runScenario(scenario, {
          claudeBinary,
          model: process.env['EVAL_MODEL'],
          budgetUsd: Number(process.env['EVAL_BUDGET_USD'] ?? '5'),
          serverUnderTest: serverUnderTestFrom(process.env['EVAL_SERVER']),
          withPlugin: withPluginFrom(process.env['EVAL_PLUGIN']),
          agentTimeoutMs,
          resultsDirectory: join(import.meta.dirname, 'results'),
        });
        console.log(
          JSON.stringify({ scenario: result.scenario, passed: result.passed, toolCalls: result.toolCallCount, ended: result.agent.ended, costUsd: result.agent.costUsd }),
        );

        expect(result.checks.filter((check) => !check.passed)).toEqual([]);
      },
      agentTimeoutMs + 10 * 60_000,
    );
  }
});
