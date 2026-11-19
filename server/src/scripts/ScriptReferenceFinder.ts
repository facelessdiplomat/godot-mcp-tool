import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod/v4';
import type { LanguageServerAddress } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { SymbolPosition } from '../lsp/LanguageServerClient.js';
import { editorPathOf, resourcePathOfEditorPath } from '../project/EditorPaths.js';
import { filesInFolder } from '../project/ProjectFiles.js';
import type { ScriptFile } from './ScriptFiles.js';
import { sceneKindOf, type SymbolKind } from './SymbolDeclaration.js';
import { type LocatedSymbol, locateSymbol, occurrencesOf, otherDeclarationsOf } from './SymbolLocation.js';

export interface ReferenceSession {
  references(target: SymbolPosition): Promise<SymbolPosition[]>;
  close(): void;
}

export interface ScriptReferenceFinderDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorGateway;
  readonly languageServerAddress: () => Promise<LanguageServerAddress | undefined>;
  readonly connect: (address: LanguageServerAddress) => Promise<ReferenceSession>;
}

export interface ReferenceRequest {
  readonly path: string;
  readonly symbol: string;
}

export interface CodePlace {
  readonly resourcePath: string;
  readonly line: number;
  readonly text: string;
}

export interface SceneUse {
  readonly line: number;
  readonly kind: string;
  readonly count: number;
  readonly node: string;
  readonly text: string;
}

export interface SceneUses {
  readonly resourcePath: string;
  readonly uses: readonly SceneUse[];
}

export interface OtherDeclaration {
  readonly declaration: CodePlace;
  readonly uses: readonly CodePlace[];
}

export interface ReferenceReport {
  readonly symbol: string;
  readonly kind: SymbolKind;
  readonly script: string;
  readonly declaration: CodePlace;
  readonly code: readonly CodePlace[];
  readonly resources: readonly SceneUses[];
  readonly mentions: readonly CodePlace[];
  readonly otherDeclarations: readonly OtherDeclaration[];
  readonly unsavedFiles: readonly string[];
}

interface TracedPlace {
  readonly resourcePath: string;
  readonly line: number;
  readonly character: number;
}

export class ReferenceSearchError extends Error {
  override readonly name = 'ReferenceSearchError';
}

const resourcePrefix = 'res://';
const addonsPrefix = 'res://addons/';
const scriptExtension = '.gd';
const rescanTimeoutMs = 90_000;
const unsavedFilesSchema = z.object({ scenes: z.array(z.string()), scripts: z.array(z.string()) });
const sceneUsesSchema = z.object({
  files: z.array(z.object({ path: z.string(), uses: z.array(z.object({ line: z.number(), kind: z.string(), count: z.number(), node: z.string(), text: z.string() })) })),
});

export class ScriptReferenceFinder {
  constructor(private readonly dependencies: ScriptReferenceFinderDependencies) {}

  async find(request: ReferenceRequest): Promise<ReferenceReport> {
    const { projectRoot, editor } = this.dependencies;
    if (projectRoot === undefined) {
      throw new ReferenceSearchError('No Godot project was found, so there is nothing to search. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const target = locateSymbol(projectRoot, request.path, request.symbol);
    const address = await this.dependencies.languageServerAddress();
    if (address === undefined) {
      throw new ReferenceSearchError('Finding references needs the language server of the Godot editor, and the editor is not connected. Start it with editor_launch.');
    }
    const unsaved = unsavedFilesSchema.parse(await editor.request('editor.unsaved_files', {}));
    await editor.request('editor.rescan', {}, { timeoutMs: rescanTimeoutMs }).catch(() => undefined);
    const searchesAddons = target.script.resourcePath.startsWith(addonsPrefix);
    const scripts = scriptsToSearch(projectRoot, target.script, searchesAddons);
    const others = otherDeclarationsOf(scripts, request.symbol, target.script);
    const [tracedToTarget = [], ...tracedToOthers] = await this.trace(address, [target, ...others], searchesAddons);
    const lines = new FileLines(projectRoot);
    const codePlaceAt = (place: TracedPlace): CodePlace => ({ resourcePath: place.resourcePath, line: place.line + 1, text: lines.textAt(place.resourcePath, place.line) });
    const tracedKeys = new Set(tracedToTarget.map(placeKey));
    const claimedKeys = new Set([...tracedKeys, ...[target, ...others].map((symbol) => placeKey(declarationPlace(symbol))), ...tracedToOthers.flat().map(placeKey)]);
    const sceneKind = sceneKindOf(target.declaration.kind);
    return {
      symbol: request.symbol,
      kind: target.declaration.kind,
      script: target.script.resourcePath,
      declaration: codePlaceAt(declarationPlace(target)),
      code: uniqueLines(tracedToTarget.filter((place) => !isDeclarationOf(target, place)).map(codePlaceAt)),
      resources:
        sceneKind === undefined
          ? []
          : sceneUsesSchema
              .parse(await editor.request('script.find_in_resources', { script: target.script.resourcePath, symbol: request.symbol, kind: sceneKind }))
              .files.map((file) => ({ resourcePath: file.path, uses: file.uses })),
      mentions: uniqueLines(
        occurrencesOf(scripts, request.symbol)
          .filter((occurrence) => !claimedKeys.has(placeKey(occurrence)))
          .map((occurrence) => ({ resourcePath: occurrence.resourcePath, line: occurrence.line + 1, text: occurrence.text })),
      ),
      otherDeclarations: others.map((other, index) => ({
        declaration: codePlaceAt(declarationPlace(other)),
        uses: uniqueLines((tracedToOthers[index] ?? []).filter((place) => !isDeclarationOf(other, place) && !tracedKeys.has(placeKey(place))).map(codePlaceAt)),
      })),
      unsavedFiles: [...unsaved.scenes, ...unsaved.scripts],
    };
  }

  private async trace(address: LanguageServerAddress, symbols: readonly LocatedSymbol[], searchesAddons: boolean): Promise<TracedPlace[][]> {
    const session = await this.dependencies.connect(address);
    try {
      const traced: TracedPlace[][] = [];
      for (const { script, declaration } of symbols) {
        const positions = await session.references({ path: editorPathOf(address.projectPath, script.resourcePath), line: declaration.line, character: declaration.character });
        traced.push(placesInProject(address.projectPath, positions, searchesAddons));
      }
      return traced;
    } finally {
      session.close();
    }
  }
}

function placesInProject(projectPath: string, positions: readonly SymbolPosition[], searchesAddons: boolean): TracedPlace[] {
  return positions.flatMap((position) => {
    const resourcePath = resourcePathOfEditorPath(projectPath, position.path);
    return resourcePath === undefined || (resourcePath.startsWith(addonsPrefix) && !searchesAddons) ? [] : [{ resourcePath, line: position.line, character: position.character }];
  });
}

function declarationPlace({ script, declaration }: LocatedSymbol): TracedPlace {
  return { resourcePath: script.resourcePath, line: declaration.line, character: declaration.character };
}

function isDeclarationOf(symbol: LocatedSymbol, place: TracedPlace): boolean {
  return placeKey(place) === placeKey(declarationPlace(symbol));
}

class FileLines {
  private readonly cache = new Map<string, string[]>();

  constructor(private readonly projectRoot: string) {}

  textAt(resourcePath: string, line: number): string {
    let lines = this.cache.get(resourcePath);
    if (lines === undefined) {
      lines = readFileSync(join(this.projectRoot, resourcePath.slice(resourcePrefix.length)), 'utf8').split('\n');
      this.cache.set(resourcePath, lines);
    }
    return (lines[line] ?? '').trim();
  }
}

function scriptsToSearch(projectRoot: string, script: ScriptFile, searchesAddons: boolean): ScriptFile[] {
  const scripts = filesInFolder(projectRoot, projectRoot, [scriptExtension]);
  return searchesAddons && !scripts.some((file) => file.resourcePath === script.resourcePath) ? [...scripts, script] : scripts;
}

function placeKey(place: { resourcePath: string; line: number; character: number }): string {
  return `${place.resourcePath}:${String(place.line)}:${String(place.character)}`;
}

function uniqueLines(places: readonly CodePlace[]): CodePlace[] {
  const seen = new Set<string>();
  return [...places]
    .sort((left, right) => left.resourcePath.localeCompare(right.resourcePath) || left.line - right.line)
    .filter((place) => {
      const key = `${place.resourcePath}:${String(place.line)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}
