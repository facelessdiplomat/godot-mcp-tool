import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod/v4';
import type { LanguageServerAddress } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import type { LineEdit, SymbolPosition } from '../lsp/LanguageServerClient.js';
import type { ScriptText } from '../lsp/LanguageServerClient.js';
import { editorPathOf, resourcePathOfEditorPath } from '../project/EditorPaths.js';
import { findScripts } from './ScriptFiles.js';
import { findDeclaration, type SymbolKind } from './SymbolDeclaration.js';

export interface RenameSession {
  rename(scripts: readonly ScriptText[], target: SymbolPosition, newName: string): Promise<Map<string, LineEdit[]>>;
  close(): void;
}

export interface ScriptRenamerDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorGateway;
  readonly languageServerAddress: () => Promise<LanguageServerAddress | undefined>;
  readonly connect: (address: LanguageServerAddress) => Promise<RenameSession>;
}

export interface RenameRequest {
  readonly path: string;
  readonly symbol: string;
  readonly newName: string;
}

export interface ChangedFile {
  readonly resourcePath: string;
  readonly changes: Readonly<Record<string, number>>;
}

export interface Mention {
  readonly resourcePath: string;
  readonly line: number;
  readonly text: string;
}

export interface RenameReport {
  readonly symbol: string;
  readonly newName: string;
  readonly kind: SymbolKind;
  readonly script: string;
  readonly scripts: readonly ChangedFile[];
  readonly resources: readonly ChangedFile[];
  readonly mentions: readonly Mention[];
}

export class RenameError extends Error {
  override readonly name = 'RenameError';
}

const identifierPattern = /^[A-Za-z_]\w*$/;
const resourcePrefix = 'res://';
const rescanTimeoutMs = 90_000;
const maximumMentions = 10;
const resourceKinds: Readonly<Partial<Record<SymbolKind, string>>> = { function: 'function', signal: 'signal', variable: 'variable' };
const unsavedFilesSchema = z.object({ scenes: z.array(z.string()), scripts: z.array(z.string()) });
const renamedResourcesSchema = z.object({ files: z.array(z.object({ path: z.string(), changes: z.record(z.string(), z.number()) })) });

export class ScriptRenamer {
  constructor(private readonly dependencies: ScriptRenamerDependencies) {}

  async rename(request: RenameRequest): Promise<RenameReport> {
    const { projectRoot, editor } = this.dependencies;
    if (projectRoot === undefined) {
      throw new RenameError('No Godot project was found, so there is nothing to rename. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    if (!identifierPattern.test(request.newName) || request.newName === request.symbol) {
      throw new RenameError(`"${request.newName}" is not a new name for ${request.symbol}; use letters, digits and _, not starting with a digit.`);
    }
    const [script] = findScripts(projectRoot, [request.path]);
    if (script === undefined) {
      throw new RenameError(`${request.path} is not a .gd script.`);
    }
    const declaration = findDeclaration(readFileSync(script.absolutePath, 'utf8'), request.symbol);
    if (declaration === undefined) {
      throw new RenameError(`${script.resourcePath} declares no ${request.symbol}; pass the script that declares it, such as the one with "func ${request.symbol}(".`);
    }
    const address = await this.dependencies.languageServerAddress();
    if (address === undefined) {
      throw new RenameError('Renaming needs the language server of the Godot editor, and the editor is not connected. Start it with editor_launch.');
    }
    const unsaved = unsavedFilesSchema.parse(await editor.request('editor.unsaved_files', {}));
    const unsavedFiles = [...unsaved.scenes, ...unsaved.scripts];
    if (unsavedFiles.length > 0) {
      throw new RenameError(`Save these files in the editor first, so that the rename does not overwrite their changes: ${unsavedFiles.join(', ')}. scene_save with all: true saves the scenes.`);
    }
    await editor.request('editor.rescan', {}, { timeoutMs: rescanTimeoutMs });
    const scripts = findScripts(projectRoot, [resourcePrefix, script.resourcePath]);
    const inEditor = (resourcePath: string): string => editorPathOf(address.projectPath, resourcePath);
    const session = await this.dependencies.connect(address);
    let edits: Map<string, LineEdit[]>;
    try {
      edits = await session.rename(
        scripts.map((file) => ({ path: inEditor(file.resourcePath), text: readFileSync(file.absolutePath, 'utf8') })),
        { path: inEditor(script.resourcePath), line: declaration.line, character: declaration.character },
        request.newName,
      );
    } finally {
      session.close();
    }
    if (edits.size === 0) {
      throw new RenameError(`The language server found nothing to rename for ${request.symbol} in ${script.resourcePath}.`);
    }
    const changedScripts = [...edits].flatMap(([editorPath, lineEdits]) => {
      const resourcePath = resourcePathOfEditorPath(address.projectPath, editorPath);
      return resourcePath === undefined ? [] : [applyEdits(projectRoot, resourcePath, lineEdits)];
    });
    const kind = resourceKinds[declaration.kind];
    const resources =
      kind === undefined
        ? []
        : renamedResourcesSchema
            .parse(await editor.request('script.rename_in_resources', { script: script.resourcePath, symbol: request.symbol, new_name: request.newName, kind }))
            .files.map((file) => ({ resourcePath: file.path, changes: file.changes }));
    await editor.request('editor.rescan', {}, { timeoutMs: rescanTimeoutMs });
    return {
      symbol: request.symbol,
      newName: request.newName,
      kind: declaration.kind,
      script: script.resourcePath,
      scripts: changedScripts,
      resources,
      mentions: mentionsOf(projectRoot, request.symbol),
    };
  }
}

function applyEdits(projectRoot: string, resourcePath: string, lineEdits: readonly LineEdit[]): ChangedFile {
  const absolutePath = join(projectRoot, resourcePath.slice(resourcePrefix.length));
  const lines = readFileSync(absolutePath, 'utf8').split('\n');
  const ordered = [...lineEdits].sort((left, right) => right.line - left.line || right.startCharacter - left.startCharacter);
  for (const edit of ordered) {
    const line = lines[edit.line] ?? '';
    lines[edit.line] = `${line.slice(0, edit.startCharacter)}${edit.newText}${line.slice(edit.endCharacter)}`;
  }
  writeFileSync(absolutePath, lines.join('\n'));
  return { resourcePath, changes: { places: lineEdits.length } };
}

function mentionsOf(projectRoot: string, symbol: string): Mention[] {
  const wholeWord = new RegExp(`\\b${symbol}\\b`);
  const mentions: Mention[] = [];
  for (const script of findScripts(projectRoot, [resourcePrefix])) {
    const lines = readFileSync(script.absolutePath, 'utf8').split('\n');
    for (const [index, line] of lines.entries()) {
      if (wholeWord.test(line) && mentions.length < maximumMentions) {
        mentions.push({ resourcePath: script.resourcePath, line: index + 1, text: line.trim() });
      }
    }
  }
  return mentions;
}
