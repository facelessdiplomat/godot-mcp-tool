import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeConnectionError, BridgeProtocolError, BridgeRequestError } from '../bridge/BridgeErrors.js';
import { EditorUnavailableError } from '../editor/EditorGateway.js';
import { LanguageServerUnavailableError } from '../lsp/LanguageServerClient.js';
import { ScriptPathError } from '../scripts/ScriptFiles.js';
import { type ChangedFile, RenameError, type RenameReport, type RenameRequest } from '../scripts/ScriptRenamer.js';
import { changingAnnotations } from './annotations.js';
import { describeRequestFailure } from './bridge/BridgeTool.js';
import { errorResult, textResult } from './results.js';
import type { Tool, ToolDefinition } from './Tool.js';

export interface SymbolRenamer {
  rename(request: RenameRequest): Promise<RenameReport>;
}

const changeNames: Readonly<Record<string, readonly [string, string]>> = {
  connections: ['signal connection', 'signal connections'],
  method_keys: ['method track key', 'method track keys'],
  properties: ['saved value', 'saved values'],
  animated_paths: ['animated property path', 'animated property paths'],
};

const scriptRenameInput = z.object({
  path: z.string().min(1).describe('The script that declares the symbol, as a res:// path, such as "res://enemy.gd".'),
  symbol: z.string().min(1).describe('The function, signal, variable, constant, enum or class_name to rename, such as "take_damage".'),
  new_name: z.string().min(1).describe('The new name, such as "apply_damage".'),
});

export class ScriptRenameTool implements Tool<typeof scriptRenameInput> {
  readonly name = 'script_rename_symbol';

  readonly definition: ToolDefinition<typeof scriptRenameInput> = {
    title: 'Rename symbol',
    description:
      "Rename a function, signal, variable, constant, enum or class_name across the project with the editor's language server, which renames every use it can trace in the scripts; then also the method names of signal connections, the keys of method tracks, saved values and animated paths in scenes and resources that use the script, which a rename in code alone leaves broken. It lists the places that still name the old symbol, such as strings in call() or has_method(), to check by hand. Save open files first; needs the editor.",
    inputSchema: scriptRenameInput,
    annotations: changingAnnotations({ destructive: false, idempotent: false }),
    alwaysLoad: false,
  };

  constructor(private readonly renamer: SymbolRenamer) {}

  async execute(input: z.input<typeof scriptRenameInput>): Promise<CallToolResult> {
    const parsedInput = scriptRenameInput.safeParse(input);
    if (!parsedInput.success) {
      return errorResult(`Invalid arguments for ${this.name}:\n${z.prettifyError(parsedInput.error)}`);
    }
    try {
      return textResult(describeRename(await this.renamer.rename({ path: parsedInput.data.path, symbol: parsedInput.data.symbol, newName: parsedInput.data.new_name })));
    } catch (error) {
      if (error instanceof RenameError || error instanceof ScriptPathError || error instanceof LanguageServerUnavailableError) {
        return errorResult(error.message);
      }
      if (error instanceof EditorUnavailableError || error instanceof BridgeRequestError || error instanceof BridgeConnectionError || error instanceof BridgeProtocolError) {
        return describeRequestFailure(error);
      }
      throw error;
    }
  }
}

function describeRename(report: RenameReport): string {
  const places = report.scripts.reduce((total, file) => total + (file.changes['places'] ?? 0), 0);
  const lines = [
    `Renamed the ${report.kind} ${report.symbol} of ${report.script} to ${report.newName} in ${String(places)} ${places === 1 ? 'place' : 'places'} of code: ${report.scripts
      .map((file) => `${file.resourcePath} (${String(file.changes['places'] ?? 0)})`)
      .join(', ')}.`,
  ];
  if (report.resources.length > 0) {
    lines.push(`In scenes and resources: ${report.resources.map(describeResource).join('; ')}.`);
  }
  lines.push('The editor reloaded the changed files.');
  if (report.mentions.length > 0) {
    lines.push(
      `Still named ${report.symbol} — in strings, comments, other classes, or calls the language server could not trace; check each:`,
      ...report.mentions.map((mention) => `- ${mention.resourcePath}:${String(mention.line)}: ${mention.text}`),
    );
  }
  return lines.join('\n');
}

function describeResource(file: ChangedFile): string {
  const changes = Object.entries(file.changes).map(([key, count]) => {
    const [one, many] = changeNames[key] ?? [key, key];
    return `${String(count)} ${count === 1 ? one : many}`;
  });
  return `${file.resourcePath}: ${changes.join(', ')}`;
}
