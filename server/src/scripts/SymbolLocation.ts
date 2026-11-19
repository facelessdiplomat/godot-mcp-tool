import { readFileSync } from 'node:fs';
import { findScripts, type ScriptFile } from './ScriptFiles.js';
import { findDeclaration, type SymbolDeclaration } from './SymbolDeclaration.js';

export class SymbolLookupError extends Error {
  override readonly name = 'SymbolLookupError';
}

export interface LocatedSymbol {
  readonly script: ScriptFile;
  readonly declaration: SymbolDeclaration;
}

export interface WordOccurrence {
  readonly resourcePath: string;
  readonly line: number;
  readonly character: number;
  readonly text: string;
}

export function locateSymbol(projectRoot: string, path: string, symbol: string): LocatedSymbol {
  const [script] = findScripts(projectRoot, [path]);
  if (script === undefined) {
    throw new SymbolLookupError(`${path} is not a .gd script.`);
  }
  const declaration = findDeclaration(readFileSync(script.absolutePath, 'utf8'), symbol);
  if (declaration === undefined) {
    throw new SymbolLookupError(`${script.resourcePath} declares no ${symbol}; pass the script that declares it, such as the one with "func ${symbol}(".`);
  }
  return { script, declaration };
}

export function occurrencesOf(scripts: readonly ScriptFile[], symbol: string): WordOccurrence[] {
  const wholeWord = new RegExp(`(?<![\\w])${symbol}(?![\\w])`, 'g');
  return scripts.flatMap((script) =>
    readFileSync(script.absolutePath, 'utf8')
      .split('\n')
      .flatMap((line, index) => [...line.matchAll(wholeWord)].map((match) => ({ resourcePath: script.resourcePath, line: index, character: match.index, text: line.trim() }))),
  );
}
