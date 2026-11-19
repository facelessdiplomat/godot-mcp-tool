import * as z from 'zod/v4';
import type { EditorGateway } from './EditorGateway.js';

const pingAnswerSchema = z.object({ changes_held: z.boolean().optional() });

export async function areChangesHeld(editor: EditorGateway): Promise<boolean> {
  return pingAnswerSchema.safeParse(await editor.request('ping', {})).data?.changes_held === true;
}
