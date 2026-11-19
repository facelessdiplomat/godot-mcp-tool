import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeConnectionError, BridgeProtocolError, BridgeRequestError } from '../bridge/BridgeErrors.js';
import { EditorUnavailableError } from '../editor/EditorGateway.js';
import { LanguageServerUnavailableError } from '../lsp/LanguageServerClient.js';
import { ScriptPathError } from '../scripts/ScriptFiles.js';
import { type CodePlace, type ReferenceReport, type ReferenceRequest, ReferenceSearchError, type SceneUse } from '../scripts/ScriptReferenceFinder.js';
import { sceneKindOf } from '../scripts/SymbolDeclaration.js';
import { SymbolLookupError } from '../scripts/SymbolLocation.js';
import { readingAnnotations } from './annotations.js';
import { describeRequestFailure } from './bridge/BridgeTool.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface ReferenceFinder {
  find(request: ReferenceRequest): Promise<ReferenceReport>;
}

const maximumCodePlaces = 100;
const maximumMentions = 20;

const scriptFindReferencesInput = z.object({
  path: z.string().min(1).describe('The script that declares the symbol, as a res:// path, such as "res://enemy.gd".'),
  symbol: z.string().min(1).describe('The function, signal, variable, constant, enum or class_name to look for, such as "take_damage".'),
});

export class ScriptFindReferencesTool implements Tool<typeof scriptFindReferencesInput> {
  readonly name = 'script_find_references';

  readonly definition: ToolDefinition<typeof scriptFindReferencesInput> = {
    title: 'Find references',
    description:
      "Find where a function, signal, variable, constant, enum or class_name is declared and used across the project, such as before changing the arguments of a function or removing it. The editor's language server traces the uses in scripts, also through typed variables and class names; then come the signal connections, method track keys, saved values and animated properties of scenes and resources that use the script, which the language server does not see, and the lines that name the symbol where it could not be traced, such as calls on untyped variables or strings in call() and has_method(). Lines count from 1. Needs the editor.",
    inputSchema: scriptFindReferencesInput,
    annotations: readingAnnotations,
    alwaysLoad: false,
  };

  constructor(private readonly finder: ReferenceFinder) {}

  async execute(input: z.input<typeof scriptFindReferencesInput>): Promise<CallToolResult> {
    const parsedInput = scriptFindReferencesInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    try {
      return textResult(describeReferences(await this.finder.find(parsedInput.data)));
    } catch (error) {
      if (error instanceof ReferenceSearchError || error instanceof SymbolLookupError || error instanceof ScriptPathError || error instanceof LanguageServerUnavailableError) {
        return errorResult(error.message);
      }
      if (error instanceof EditorUnavailableError || error instanceof BridgeRequestError || error instanceof BridgeConnectionError || error instanceof BridgeProtocolError) {
        return describeRequestFailure(error);
      }
      throw error;
    }
  }
}

function describeReferences(report: ReferenceReport): string {
  const lines = [`${report.symbol} is a ${report.kind} of ${report.script}, declared at ${placeOf(report.declaration)}`];
  if (report.code.length === 0) {
    lines.push('No use in code that the language server could trace.');
  } else {
    lines.push(`Used in code, as the language server traces it (${countOf(report.code.length, 'place')}):`, ...listed(report.code.map((place) => `- ${placeOf(place)}`), maximumCodePlaces, 'places in code'));
  }
  if (sceneKindOf(report.kind) !== undefined) {
    const uses = report.resources.flatMap((file) => file.uses.map((use) => `- ${file.resourcePath}:${String(use.line)}: ${describeSceneUse(use, report)}: ${use.text}`));
    const places = report.resources.reduce((total, file) => total + file.uses.reduce((sum, use) => sum + use.count, 0), 0);
    lines.push(
      ...(uses.length === 0
        ? ['No signal connection, method track key, saved value or animated property in scenes and resources.']
        : [`Used in scenes and resources, which the language server does not see (${countOf(places, 'place')}):`, ...uses]),
    );
  }
  if (report.mentions.length > 0) {
    lines.push(
      `Named ${report.symbol} where the language server could not trace it — calls on untyped variables, strings such as call("${report.symbol}"), comments, or another class with its own ${report.symbol}; check each:`,
      ...listed(report.mentions.map((place) => `- ${placeOf(place)}`), maximumMentions, ''),
    );
  }
  if (report.unsavedFiles.length > 0) {
    lines.push(`Files were read as saved on disk; these have unsaved changes in the editor: ${report.unsavedFiles.join(', ')}.`);
  }
  return lines.join('\n');
}

function describeSceneUse(use: SceneUse, report: ReferenceReport): string {
  switch (use.kind) {
    case 'connections':
      return `a signal connection ${report.kind === 'signal' ? 'from' : 'to'} ${use.node}`;
    case 'method_keys':
      return use.count === 1 ? '1 method track key' : `${String(use.count)} method track keys`;
    case 'properties':
      return `a saved value of ${use.node}`;
    case 'animated_paths':
      return `an animated property of ${use.node}`;
    default:
      return use.kind;
  }
}

function placeOf(place: CodePlace): string {
  return `${place.resourcePath}:${String(place.line)}: ${place.text}`;
}

function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function listed(items: readonly string[], maximum: number, what: string): string[] {
  if (items.length <= maximum) {
    return [...items];
  }
  return [...items.slice(0, maximum), `- … and ${String(items.length - maximum)} more${what === '' ? '' : ` ${what}`}`];
}
