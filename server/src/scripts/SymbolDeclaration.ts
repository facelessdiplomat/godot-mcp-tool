export type SymbolKind = 'function' | 'signal' | 'variable' | 'constant' | 'enum' | 'class';

export interface SymbolDeclaration {
  readonly line: number;
  readonly character: number;
  readonly kind: SymbolKind;
}

const keywordKinds: Readonly<Record<string, SymbolKind>> = {
  func: 'function',
  signal: 'signal',
  var: 'variable',
  const: 'constant',
  enum: 'enum',
  class_name: 'class',
  class: 'class',
};

const declarationPattern = /^(?<lead>\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*(?:static\s+)?(?<keyword>func|signal|var|const|enum|class_name|class)\s+)(?<name>[A-Za-z_]\w*)\b/;

export function findDeclaration(text: string, symbol: string): SymbolDeclaration | undefined {
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const match = declarationPattern.exec(line);
    const groups = match?.groups;
    if (groups?.['name'] === symbol) {
      const kind = keywordKinds[groups['keyword'] ?? ''];
      if (kind !== undefined) {
        return { line: index, character: (groups['lead'] ?? '').length, kind };
      }
    }
  }
  return undefined;
}

export type SceneSymbolKind = 'function' | 'signal' | 'variable';

const sceneKinds: Readonly<Partial<Record<SymbolKind, SceneSymbolKind>>> = { function: 'function', signal: 'signal', variable: 'variable' };

export function sceneKindOf(kind: SymbolKind): SceneSymbolKind | undefined {
  return sceneKinds[kind];
}
