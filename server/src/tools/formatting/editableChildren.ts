import * as z from 'zod/v4';

export const editableChildrenSchema = z.array(z.string()).default([]);

export const editableChildrenExplanation = 'Editable Children keeps changes inside instanced scenes saved with this scene.';

export function withEditableChildrenSentence(text: string, instancePaths: readonly string[]): string {
  if (instancePaths.length === 0) {
    return text;
  }
  const scenes = instancePaths.length === 1 ? 'the instanced scene' : 'the instanced scenes';
  return `${text}\nTurned on Editable Children of ${instancePaths.join(', ')}, so that this change inside ${scenes} is saved with this scene.`;
}

export function withEditableChildrenNote(summary: string, instancePaths: readonly string[]): string {
  return instancePaths.length === 0 ? summary : `${summary}; turned on Editable Children of ${instancePaths.join(', ')}`;
}
