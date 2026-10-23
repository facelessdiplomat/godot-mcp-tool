import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';

const hookSchema = z.object({ type: z.string(), command: z.string(), if: z.string().optional() });
const hooksFileSchema = z.object({
  hooks: z.object({ PostToolUse: z.array(z.object({ matcher: z.string(), hooks: z.array(hookSchema) })) }),
});

const hooksFile = hooksFileSchema.parse(JSON.parse(readFileSync(new URL('../../../plugin/hooks/hooks.json', import.meta.url), 'utf8')));

function scriptChecksAfter(tool: string): z.infer<typeof hookSchema>[] {
  return hooksFile.hooks.PostToolUse.filter((group) => new RegExp(`^(?:${group.matcher})$`).test(tool))
    .flatMap((group) => group.hooks)
    .filter((hook) => hook.command.includes('check-edited-script'));
}

describe('the hooks of the Claude Code plugin', () => {
  it.each(['Write', 'Edit'])('check every GDScript file that %s changes, and only those', (tool) => {
    expect(scriptChecksAfter(tool).map((hook) => hook.if)).toEqual([`${tool}(*.gd)`]);
  });
});
