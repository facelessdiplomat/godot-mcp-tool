import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { textResult } from './results.js';

const defaultMaxBytes = 8000;
const largestMaxBytes = 200_000;

const userFileSchema = z.object({ path: z.string(), size: z.number(), modified: z.string() });

const userDataSchema = z.object({
  kind: z.enum(['folder', 'file']),
  folder: z.string(),
  path: z.string(),
  entries: z.array(userFileSchema).optional(),
  more: z.boolean().optional(),
  size: z.number().optional(),
  modified: z.string().optional(),
  text: z.string().optional(),
  truncated: z.boolean().optional(),
  binary: z.boolean().optional(),
});

type UserData = z.infer<typeof userDataSchema>;

const userDataGetInput = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe('A file or folder in the user data, such as "user://save.json" or "saves"; the user:// prefix may be left out. Default: the whole folder, listed.'),
  max_bytes: z.number().int().min(1).max(largestMaxBytes).default(defaultMaxBytes).describe('The most bytes of a file to show.'),
});

export function createUserDataGetTool(projectReader: EditorGateway): BridgeTool<typeof userDataGetInput, UserData> {
  return new BridgeTool(projectReader, {
    name: 'user_data_get',
    definition: {
      title: 'Read user data',
      description:
        "Read user://, the folder where the game keeps saved games, settings and logs: without a path, every file with its size and the time it changed; with a file, its text. Use it to check what the game saved after game_run. Works without the editor. To clear saves, delete them with user_data_delete when unsafe tools are on.",
      inputSchema: userDataGetInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'project.user_data_get',
    responseSchema: userDataSchema,
    present: (data) => textResult(describeUserData(data)),
  });
}

function describeUserData(data: UserData): string {
  if (data.kind === 'folder') {
    const entries = data.entries ?? [];
    const lines = [`The user data of the game is in ${data.folder}.`];
    if (entries.length === 0) {
      lines.push(`${data.path} is empty.`);
      return lines.join('\n');
    }
    lines.push(`${data.path} holds ${String(entries.length)} ${entries.length === 1 ? 'file' : 'files'}:`, ...entries.map((entry) => `- ${describeFile(entry)}`));
    if (data.more === true) {
      lines.push('More files follow; read a subfolder to see them.');
    }
    return lines.join('\n');
  }
  const heading = `${describeFile({ path: data.path, size: data.size ?? 0, modified: data.modified ?? '?' })}, in ${data.folder}`;
  if (data.binary === true) {
    return `${heading}, is a binary file.`;
  }
  const lines = [`${heading}:`, data.text ?? ''];
  if (data.truncated === true) {
    lines.push(`Only the first ${String(Buffer.byteLength(data.text ?? '', 'utf8'))} bytes are shown; read more with a larger max_bytes.`);
  }
  return lines.join('\n');
}

function describeFile(file: z.infer<typeof userFileSchema>): string {
  return `${file.path}, ${String(file.size)} bytes, changed ${file.modified}`;
}
