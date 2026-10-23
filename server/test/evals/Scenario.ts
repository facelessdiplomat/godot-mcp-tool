import type { McpSession, TemporaryProject, TemporaryProjectOptions } from '../integration/harness.js';
import type { AgentRun } from './AgentRun.js';

export interface PrepareContext {
  readonly project: TemporaryProject;
  readonly tools: McpSession;
}

export interface CheckContext extends PrepareContext {
  readonly agent: AgentRun | undefined;
}

export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export type Solution = (context: PrepareContext) => Promise<void>;

export interface Scenario {
  readonly name: string;
  readonly request: string;
  readonly window?: boolean;
  readonly projectOptions?: TemporaryProjectOptions;
  readonly unsafeTools?: boolean;
  readonly editorDuringRun?: boolean;
  readonly serverVariables?: Readonly<Record<string, string>>;
  readonly otherSolutions?: Readonly<Record<string, Solution>>;
  prepare(context: PrepareContext): Promise<void>;
  solve(context: PrepareContext): Promise<void>;
  check(context: CheckContext): Promise<CheckResult[]>;
}

export interface Vector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function checked(name: string, passed: boolean, detail: string): CheckResult {
  return { name, passed, detail };
}

export async function conditionHolds(tools: McpSession, name: string, node: string, condition: string, timeoutMs: number): Promise<CheckResult> {
  const outcome = await tools.call('game_wait', { condition, node, timeout_ms: timeoutMs });
  return checked(name, !outcome.isError && outcome.text.includes('became true'), firstLine(outcome.text));
}

export async function scriptsAreClean(tools: McpSession, paths: readonly string[] = ['res://']): Promise<CheckResult> {
  const outcome = await tools.call('script_validate', { paths });
  const summary = firstLine(outcome.text);
  return checked('the scripts have no errors', !outcome.isError && !/\berrors?\b/.test(summary), summary);
}

export async function findNodes(tools: McpSession, scene: string, criteria: Readonly<Record<string, string>>): Promise<string[]> {
  const outcome = await tools.call('node_find', { scene, ...criteria });
  return outcome.text
    .split('\n')
    .slice(1)
    .flatMap((line) => {
      const path = /^(?<path>[^:]+): \S/.exec(line.trim())?.groups?.['path'];
      return path === undefined ? [] : [path];
    });
}

export async function gameVector(tools: McpSession, path: string, property: string): Promise<Vector | undefined> {
  const outcome = await tools.call('game_get_properties', { path, names: [property] });
  return vectorIn(outcome.text, property);
}

export function vectorIn(text: string, property: string): Vector | undefined {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedProperty} = Vector3\\((?<x>[^,]+), (?<y>[^,]+), (?<z>[^)]+)\\)`).exec(text)?.groups;
  if (match === undefined) {
    return undefined;
  }
  return { x: Number(match['x']), y: Number(match['y']), z: Number(match['z']) };
}

export function horizontalDistance(from: Vector, to: Vector): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

export async function nodeCount(tools: McpSession): Promise<number | undefined> {
  const outcome = await tools.call('game_performance', {});
  const count = /nodes: (?<count>\d+)/.exec(outcome.text)?.groups?.['count'];
  return count === undefined ? undefined : Number(count);
}

export async function errorsOfTheRun(tools: McpSession): Promise<string> {
  const outcome = await tools.call('game_get_output', { levels: ['error'], from_start: true });
  return outcome.text;
}

export function agentUsed(agent: AgentRun | undefined, tools: readonly string[], name: string): CheckResult[] {
  if (agent === undefined) {
    return [];
  }
  const used = tools.filter((tool) => Object.keys(agent.toolCalls).some((called) => called === tool || called.endsWith(`__${tool}`)));
  return [checked(name, used.length > 0, used.length > 0 ? `used ${used.join(', ')}` : `used none of ${tools.join(', ')}`)];
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? '';
}
