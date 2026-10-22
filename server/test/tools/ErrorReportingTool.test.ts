import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';
import { ErrorSummary } from '../../src/runtime/ErrorSummary.js';
import { ErrorReportingTool } from '../../src/tools/ErrorReportingTool.js';
import { textResult } from '../../src/tools/results.js';
import type { Tool, ToolDefinition } from '../../src/tools/Tool.js';

const inputSchema = z.object({});

class FixedTool implements Tool<typeof inputSchema> {
  readonly name = 'fixed';
  readonly definition: ToolDefinition<typeof inputSchema>;

  constructor(
    showsErrors: boolean,
    private readonly result: CallToolResult = textResult('Done.'),
  ) {
    this.definition = { title: 'Fixed', description: 'Answers.', inputSchema, annotations: {}, alwaysLoad: false, showsErrors };
  }

  execute(): Promise<CallToolResult> {
    return Promise.resolve(this.result);
  }
}

const newErrorSummary = ['⚠ New error since the last call:', '- in the game: Boom.', 'Read the game output with game_get_output.'].join('\n');

function summaryWithNewError(): ErrorSummary {
  const summary = new ErrorSummary();
  summary.observe(1, 'log.status', { last_seq: 0, errors: 0, warnings: 0, recent_errors: [], game: 'stopped' });
  summary.observe(1, 'log.status', { last_seq: 1, errors: 1, warnings: 0, recent_errors: [{ seq: 1, source: 'game', message: 'Boom.' }], game: 'running' });
  return summary;
}

describe('ErrorReportingTool', () => {
  it('adds the new-error summary to the end of the text after a blank line', async () => {
    const result = await new ErrorReportingTool(new FixedTool(false), summaryWithNewError()).execute({});

    expect(result.content).toEqual([{ type: 'text', text: `Done.\n\n${newErrorSummary}` }]);
  });

  it('adds the summary as its own block after a result that ends with an image', async () => {
    const image = { type: 'image' as const, data: 'iVBORw0KGgo=', mimeType: 'image/png' };
    const tool = new FixedTool(false, { content: [{ type: 'text', text: 'Screenshot:' }, image] });

    const result = await new ErrorReportingTool(tool, summaryWithNewError()).execute({});

    expect(result.content).toEqual([{ type: 'text', text: 'Screenshot:' }, image, { type: 'text', text: newErrorSummary }]);
  });

  it('leaves the result alone without new errors', async () => {
    const result = await new ErrorReportingTool(new FixedTool(false), new ErrorSummary()).execute({});

    expect(result.content).toEqual([{ type: 'text', text: 'Done.' }]);
  });

  it('only acknowledges errors for tools that show them', async () => {
    const summary = summaryWithNewError();

    const result = await new ErrorReportingTool(new FixedTool(true), summary).execute({});

    expect(result.content).toEqual([{ type: 'text', text: 'Done.' }]);
    expect(summary.takeSummary()).toBeUndefined();
  });

  it('keeps the name and definition of the tool', () => {
    const tool = new ErrorReportingTool(new FixedTool(false), new ErrorSummary());

    expect(tool.name).toBe('fixed');
    expect(tool.definition.title).toBe('Fixed');
  });
});
