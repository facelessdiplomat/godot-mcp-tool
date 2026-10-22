import * as z from 'zod/v4';

export const logEntrySchema = z.object({
  seq: z.number(),
  source: z.string(),
  level: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  location: z.string().optional(),
  function: z.string().optional(),
  stack: z.array(z.string()).optional(),
  time_ms: z.number().optional(),
});

export type LogEntry = z.infer<typeof logEntrySchema>;

const gameSource = 'game';

export function formatLogEntries(entries: readonly LogEntry[]): string {
  return entries.map(formatLogEntry).join('\n');
}

function formatLogEntry(entry: LogEntry): string {
  if (entry.level === 'info' && entry.source === gameSource) {
    return entry.message;
  }
  const label = entry.source === gameSource ? entry.level.toUpperCase() : `${entry.source.toUpperCase()} ${entry.level.toUpperCase()}`;
  const place = entry.location === undefined ? '' : `${entry.location}${entry.function === undefined ? '' : ` in ${entry.function}`}: `;
  const header = `${label} ${place}${entry.message}`;
  const stack = entry.stack ?? [];
  return stack.length > 1 ? [header, ...stack.map((frame) => `  at ${frame}`)].join('\n') : header;
}
