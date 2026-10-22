import type { ToolAnnotations } from '@modelcontextprotocol/server';

export const readingAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export interface ChangeKind {
  readonly destructive: boolean;
  readonly idempotent: boolean;
}

export function changingAnnotations(kind: ChangeKind): ToolAnnotations {
  return { readOnlyHint: false, destructiveHint: kind.destructive, idempotentHint: kind.idempotent, openWorldHint: false };
}
