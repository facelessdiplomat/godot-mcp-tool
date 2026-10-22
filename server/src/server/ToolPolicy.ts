import type { Tool } from '../tools/Tool.js';

export interface ToolPolicy {
  readonly readOnly: boolean;
  readonly unsafe: boolean;
  readonly disabled: readonly string[];
}

export interface ToolSelection {
  readonly tools: Tool[];
  readonly notes: string[];
}

const switchedOnValues = new Set(['1', 'true', 'yes', 'on']);

export function readToolPolicy(variables: Readonly<Record<string, string | undefined>>): ToolPolicy {
  return {
    readOnly: isSwitchedOn(variables['GODOT_MCP_READ_ONLY']),
    unsafe: isSwitchedOn(variables['GODOT_MCP_UNSAFE']),
    disabled: (variables['GODOT_MCP_DISABLE'] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  };
}

export function applyToolPolicy(tools: readonly Tool[], policy: ToolPolicy): ToolSelection {
  const disabled = new Set(policy.disabled);
  const knownNames = new Set(tools.map((tool) => tool.name));
  const selected = tools.filter((tool) => !disabled.has(tool.name) && (!policy.readOnly || tool.definition.annotations.readOnlyHint === true));
  const notes: string[] = [];
  if (policy.readOnly) {
    notes.push('Read-only mode (GODOT_MCP_READ_ONLY): the tools that change the project or the game are left out.');
  }
  const turnedOff = policy.disabled.filter((name) => knownNames.has(name));
  if (turnedOff.length > 0) {
    notes.push(`Turned off by GODOT_MCP_DISABLE: ${turnedOff.join(', ')}.`);
  }
  const unknownNames = policy.disabled.filter((name) => !knownNames.has(name));
  if (unknownNames.length > 0) {
    notes.push(`GODOT_MCP_DISABLE names tools that do not exist: ${unknownNames.join(', ')}.`);
  }
  const unsafeNames = selected.filter((tool) => tool.definition.requiresUserInteraction === true).map((tool) => tool.name);
  if (unsafeNames.length > 0) {
    notes.push(
      `Unsafe tools are on (GODOT_MCP_UNSAFE): ${unsafeNames.join(', ')}. The editor must allow them too: Project → Tools → Godot MCP Tool → Allow Unsafe Tools.`,
    );
  }
  return { tools: selected, notes };
}

function isSwitchedOn(value: string | undefined): boolean {
  return value !== undefined && switchedOnValues.has(value.trim().toLowerCase());
}
