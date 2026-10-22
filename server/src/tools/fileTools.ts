import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { counted } from './formatting/counting.js';
import { codeMentionSchema, describeUses, fileUsagesShape, formatCodeMentions, formatSettings, hasUses, settingMentionSchema } from './formatting/fileUsageReports.js';
import { textResult } from './results.js';

const projectSearchTimeoutMs = 60_000;
const fileMoveTimeoutMs = 90_000;

const fileUsagesSchema = z.object({ path: z.string(), uid: z.string(), ...fileUsagesShape });

type FileUsageReport = z.infer<typeof fileUsagesSchema>;

const fileMoveSchema = z.object({
  from: z.string(),
  to: z.string(),
  moved: z.number().int(),
  updated: z.array(z.string()),
  not_updated: z.array(z.object({ path: z.string(), reason: z.string() })),
  settings: z.array(settingMentionSchema),
  code: z.array(codeMentionSchema),
});

type FileMove = z.infer<typeof fileMoveSchema>;

const resourceFindUsagesInput = z.object({
  path: z.string().min(1).describe('A file or folder of the project, as a res:// path such as "res://materials/ice.tres" or "res://materials".'),
});

export function createResourceFindUsagesTool(editor: EditorGateway): BridgeTool<typeof resourceFindUsagesInput, FileUsageReport> {
  return new BridgeTool(editor, {
    name: 'resource_find_usages',
    definition: {
      title: 'Find file usages',
      description:
        'Find what uses a file, or the files of a folder, before moving, renaming or deleting it: the scenes and resources that refer to it, the project settings that point at it, such as the main scene or an autoload, and the lines of scripts and shaders that name its res:// path or its UID. Code is searched as text, so paths built while the game runs are not found, and code in res://addons/ is searched only for files of addons. For a folder, uses from inside the folder are left out.',
      inputSchema: resourceFindUsagesInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'resource.find_usages',
    responseSchema: fileUsagesSchema,
    timeoutMs: projectSearchTimeoutMs,
    present: (report) => textResult(describeUsageReport(report)),
  });
}

function describeUsageReport(report: FileUsageReport): string {
  const isFolder = report.path.endsWith('/');
  if (!hasUses(report)) {
    return isFolder
      ? `Nothing outside ${report.path} uses its files: no scene or resource refers to them, no project setting points at them, and no script names their paths or UIDs.`
      : `Nothing uses ${report.path}: no scene or resource refers to it, no project setting points at it, and no script names its path or UID.`;
  }
  const heading = isFolder ? `${report.path} (a folder)` : report.uid === '' ? report.path : `${report.path} (${report.uid})`;
  return [heading, ...describeUses(report, report.path)].join('\n');
}

const filesystemMoveInput = z.object({
  from: z.string().min(1).describe('The file or folder to move, as a res:// path such as "res://materials/ice.tres".'),
  to: z
    .string()
    .min(1)
    .describe(
      'The new path, with the file or folder name, such as "res://surfaces/ice.tres", or "res://materials/frost.tres" to rename it. Missing folders are created; an existing file or folder is never replaced.',
    ),
});

export function createFilesystemMoveTool(editor: EditorGateway): BridgeTool<typeof filesystemMoveInput, FileMove> {
  return new BridgeTool(editor, {
    name: 'filesystem_move',
    definition: {
      title: 'Move or rename a file',
      description:
        'Move or rename a file or folder of the project as the FileSystem dock does: its .import and .uid files go along, the scenes and resources that refer to it get the new path, open scenes follow, and project settings that point at it, such as the main scene or an autoload, are updated. References by UID keep working. Scripts and shaders that name the old res:// path are listed for you to change, and so are binary .scn and .res files that use it, which only the editor can rewrite. The move is not in the Undo history; move it back with filesystem_move. Refuses while a scene that it changes is open with unsaved changes.',
      inputSchema: filesystemMoveInput,
      annotations: changingAnnotations({ destructive: false, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'filesystem.move',
    responseSchema: fileMoveSchema,
    timeoutMs: fileMoveTimeoutMs,
    present: (move) => textResult(describeMove(move)),
  });
}

function describeMove(move: FileMove): string {
  const isFolder = move.from.endsWith('/');
  const moved = isFolder ? `Moved the folder ${move.from} with ${counted(move.moved, 'file')} to ${move.to}.` : `Moved ${move.from} to ${move.to}.`;
  return [
    `${moved} Moves are not in the Undo history; move it back with filesystem_move if needed.`,
    ...(move.updated.length === 0 ? [] : [`Updated the paths in: ${move.updated.join(', ')}`]),
    ...(move.not_updated.length === 0 ? [] : ['Not updated:', ...move.not_updated.map((file) => `- ${file.path}: ${file.reason}`)]),
    ...(move.settings.length === 0 ? [] : [`Project settings now: ${formatSettings(move.settings)}`]),
    ...(move.code.length === 0 ? [] : [`Scripts still name the old ${isFolder ? 'paths' : 'path'}; change them:`, ...formatCodeMentions(move.code)]),
  ].join('\n');
}
