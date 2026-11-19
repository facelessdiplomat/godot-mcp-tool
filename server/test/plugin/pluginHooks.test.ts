import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/v4';

const hookSchema = z.object({ type: z.string(), command: z.string(), if: z.string().optional() });
const hookGroupsSchema = z.array(z.object({ matcher: z.string(), hooks: z.array(hookSchema) }));
const hooksFileSchema = z.object({
  hooks: z.object({ PreToolUse: hookGroupsSchema, PostToolUse: hookGroupsSchema }),
});

const hooksFile = hooksFileSchema.parse(JSON.parse(readFileSync(new URL('../../../plugin/hooks/hooks.json', import.meta.url), 'utf8')));

function hooksRunning(command: string, groups: z.infer<typeof hookGroupsSchema>, tool: string): z.infer<typeof hookSchema>[] {
  return groups
    .filter((group) => new RegExp(`^(?:${group.matcher})$`).test(tool))
    .flatMap((group) => group.hooks)
    .filter((hook) => hook.command.endsWith(` ${command}`));
}

describe('the hooks of the Claude Code plugin', () => {
  it.each(['Write', 'Edit'])('check every GDScript file and shader that %s changes, and only those', (tool) => {
    expect(hooksRunning('check-edited-script', hooksFile.hooks.PostToolUse, tool).map((hook) => hook.if)).toEqual([`${tool}(*.gd)`, `${tool}(*.gdshader)`]);
  });

  it.each(['Write', 'Edit'])('look at every scene and resource before %s changes it, and only at those', (tool) => {
    expect(hooksRunning('check-scene-edit', hooksFile.hooks.PreToolUse, tool).map((hook) => hook.if)).toEqual([`${tool}(*.tscn)`, `${tool}(*.tres)`]);
  });

  it('run nothing else before a tool', () => {
    expect(hooksFile.hooks.PreToolUse.flatMap((group) => group.hooks).filter((hook) => !hook.command.endsWith(' check-scene-edit'))).toEqual([]);
  });
});
