import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { registeredToolNames } from '../support/registeredToolNames.js';

const agentFolder = new URL('../../../plugin/agents/', import.meta.url);
const agentFiles = readdirSync(agentFolder).filter((fileName) => fileName.endsWith('.md'));
const pluginToolPrefix = 'mcp__plugin_godot_godot__';
const fileTools = ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Glob', 'Grep'];

function frontmatterOf(fileName: string): Map<string, string> {
  const text = readFileSync(new URL(fileName, agentFolder), 'utf8');
  const block = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
  return new Map(
    block.split('\n').map((line) => {
      const separator = line.indexOf(':');
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
}

function toolsOf(fileName: string): string[] {
  return (frontmatterOf(fileName).get('tools') ?? '').split(',').map((tool) => tool.trim()).filter((tool) => tool !== '');
}

describe('the subagents of the Claude Code plugin', () => {
  it('include the playtester', () => {
    expect(agentFiles).toContain('playtester.md');
  });

  it.each(agentFiles)('%s has a name and a description that Claude Code lists', (fileName) => {
    const frontmatter = frontmatterOf(fileName);

    expect(frontmatter.get('name')).toBe(fileName.replace(/\.md$/, ''));
    expect(frontmatter.get('description')?.length).toBeGreaterThan(80);
  });

  it.each(agentFiles)('%s names only godot tools that exist, and no file tools', async (fileName) => {
    const toolNames = await registeredToolNames();
    const tools = toolsOf(fileName);

    expect(tools.length).toBeGreaterThan(5);
    expect(tools.filter((tool) => !tool.startsWith(pluginToolPrefix) || !toolNames.includes(tool.slice(pluginToolPrefix.length)))).toEqual([]);
    expect(tools.filter((tool) => fileTools.includes(tool))).toEqual([]);
  });
});
