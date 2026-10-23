import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allScenarios } from './scenarios/allScenarios.js';

const evalsDocumentation = join(import.meta.dirname, '..', '..', '..', 'docs', 'evals');

function requestIn(description: string): string {
  const lines = description.split('\n');
  const start = lines.indexOf('**Request**') + 2;
  const quoted: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith('> ')) {
      break;
    }
    quoted.push(line.slice(2));
  }
  return quoted.join(' ');
}

describe('the evaluation scenarios', () => {
  for (const scenario of allScenarios) {
    it(`asks for ${scenario.name} as its description in docs/evals does`, () => {
      expect(requestIn(readFileSync(join(evalsDocumentation, `${scenario.name}.md`), 'utf8'))).toBe(scenario.request);
    });
  }
});
