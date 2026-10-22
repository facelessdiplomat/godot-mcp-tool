import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LanguageServerAddress } from '../bridge/EditorConnection.js';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { LanguageServerUnavailableError, type ScriptText } from '../lsp/LanguageServerClient.js';
import { parseCheckOnlyOutput } from './CheckOnlyOutput.js';
import { findScripts, type ScriptFile } from './ScriptFiles.js';
import type { ScriptProblem } from './ScriptProblem.js';

export type { LanguageServerAddress } from '../bridge/EditorConnection.js';

export interface LanguageServerSession {
  diagnose(scripts: readonly ScriptText[]): Promise<Map<string, ScriptProblem[]>>;
  close(): void;
}

export interface ScriptValidatorDependencies {
  readonly projectRoot: string | undefined;
  readonly editor: EditorGateway;
  readonly languageServerAddress: () => Promise<LanguageServerAddress | undefined>;
  readonly connectLanguageServer: (address: LanguageServerAddress) => Promise<LanguageServerSession>;
  readonly runCheckOnly: (resourcePath: string) => Promise<string>;
  readonly readAutoloadNames: () => readonly string[];
}

export type ValidationMethod = 'language server' | 'check-only';

export interface ScriptReport {
  readonly resourcePath: string;
  readonly problems: readonly ScriptProblem[];
}

export interface ValidationResult {
  readonly method: ValidationMethod;
  readonly reports: readonly ScriptReport[];
  readonly fallbackReason?: string;
}

export class ValidationUnavailableError extends Error {
  override readonly name = 'ValidationUnavailableError';
}

const resourcePrefix = 'res://';
const rescanTimeoutMs = 90_000;
const parallelChecks = 4;

export class ScriptValidator {
  constructor(private readonly dependencies: ScriptValidatorDependencies) {}

  async validate(inputs: readonly string[]): Promise<ValidationResult> {
    const { projectRoot } = this.dependencies;
    if (projectRoot === undefined) {
      throw new ValidationUnavailableError('No Godot project was found, so there are no scripts to check. Set GODOT_PROJECT_PATH to the folder with project.godot.');
    }
    const scripts = findScripts(projectRoot, inputs);
    const address = await this.dependencies.languageServerAddress();
    if (address === undefined) {
      return this.checkEachScript(scripts);
    }
    try {
      return { method: 'language server', reports: await this.askLanguageServer(address, scripts) };
    } catch (error) {
      if (!(error instanceof LanguageServerUnavailableError)) {
        throw error;
      }
      return { ...(await this.checkEachScript(scripts)), fallbackReason: error.message };
    }
  }

  private async askLanguageServer(address: LanguageServerAddress, scripts: readonly ScriptFile[]): Promise<ScriptReport[]> {
    await this.dependencies.editor.request('editor.rescan', {}, { timeoutMs: rescanTimeoutMs }).catch(() => undefined);
    const session = await this.dependencies.connectLanguageServer(address);
    try {
      const texts = scripts.map((script) => ({ path: join(address.projectPath, script.resourcePath.slice(resourcePrefix.length)), text: readFileSync(script.absolutePath, 'utf8') }));
      const problems = await session.diagnose(texts);
      return scripts.map((script, index) => ({ resourcePath: script.resourcePath, problems: problems.get(texts[index]?.path ?? '') ?? [] }));
    } finally {
      session.close();
    }
  }

  private async checkEachScript(scripts: readonly ScriptFile[]): Promise<ValidationResult> {
    const autoloadNames = this.dependencies.readAutoloadNames();
    const reports = await mapInParallel(scripts, parallelChecks, async (script) => ({
      resourcePath: script.resourcePath,
      problems: parseCheckOnlyOutput(await this.dependencies.runCheckOnly(script.resourcePath), autoloadNames),
    }));
    return { method: 'check-only', reports };
  }
}

async function mapInParallel<Item, Result>(items: readonly Item[], limit: number, map: (item: Item) => Promise<Result>): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index] as Item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
