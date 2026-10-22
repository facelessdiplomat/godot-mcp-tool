import * as z from 'zod/v4';

const statusNotification = 'log.status';
const gameSource = 'game';

const recentErrorSchema = z.object({
  seq: z.number(),
  source: z.string(),
  message: z.string(),
  location: z.string().optional(),
});

type RecentError = z.infer<typeof recentErrorSchema>;

export type LoggedError = Omit<RecentError, 'seq'>;

export interface ErrorDismissal {
  dismiss(isCovered: (error: LoggedError) => boolean): void;
}

const logStatusSchema = z.object({
  last_seq: z.number().int(),
  errors: z.number().int(),
  recent_errors: z.array(recentErrorSchema).catch([]),
});

type LogStatus = z.infer<typeof logStatusSchema>;

interface FoldedError {
  readonly error: RecentError;
  times: number;
}

export class ErrorSummary implements ErrorDismissal {
  private connection: number | undefined;
  private reportedErrors = 0;
  private reportedSeq = 0;
  private latest: LogStatus | undefined;
  private readonly dismissedSeqs = new Set<number>();

  observe(connection: number, method: string, params: unknown): void {
    if (method !== statusNotification) {
      return;
    }
    const status = logStatusSchema.safeParse(params);
    if (!status.success) {
      return;
    }
    this.latest = status.data;
    if (connection !== this.connection) {
      this.connection = connection;
      this.acknowledge();
    }
  }

  acknowledge(): void {
    if (this.latest !== undefined) {
      this.reportedErrors = this.latest.errors;
      this.reportedSeq = this.latest.last_seq;
    }
    this.dismissedSeqs.clear();
  }

  dismiss(isCovered: (error: LoggedError) => boolean): void {
    for (const error of this.unreportedErrors()) {
      if (isCovered(error)) {
        this.dismissedSeqs.add(error.seq);
      }
    }
  }

  takeSummary(): string | undefined {
    const latest = this.latest;
    if (latest === undefined) {
      return undefined;
    }
    const newCount = latest.errors - this.reportedErrors - this.dismissedSeqs.size;
    const newErrors = this.unreportedErrors();
    this.acknowledge();
    if (newCount <= 0) {
      return undefined;
    }
    const lines = [describeCount(newCount, newErrors.length), ...foldRepeats(newErrors).map(describeFolded)];
    if (newErrors.length < newCount || newErrors.some((error) => error.source === gameSource)) {
      lines.push('Read the game output with game_get_output.');
    }
    return lines.join('\n');
  }

  private unreportedErrors(): RecentError[] {
    return (this.latest?.recent_errors ?? []).filter((error) => error.seq > this.reportedSeq && !this.dismissedSeqs.has(error.seq));
  }
}

function describeCount(newCount: number, listedCount: number): string {
  if (newCount === 1 && listedCount === 1) {
    return '⚠ New error since the last call:';
  }
  const count = `⚠ ${String(newCount)} new ${newCount === 1 ? 'error' : 'errors'} since the last call`;
  if (listedCount === 0) {
    return `${count}.`;
  }
  return listedCount < newCount ? `${count}, the latest:` : `${count}:`;
}

function foldRepeats(errors: readonly RecentError[]): FoldedError[] {
  const folded = new Map<string, FoldedError>();
  for (const error of errors) {
    const key = `${error.source}\n${error.location ?? ''}\n${error.message}`;
    const existing = folded.get(key);
    if (existing === undefined) {
      folded.set(key, { error, times: 1 });
    } else {
      existing.times += 1;
    }
  }
  return [...folded.values()];
}

function describeFolded({ error, times }: FoldedError): string {
  const place = error.location === undefined ? '' : `${error.location}: `;
  const repetition = times > 1 ? ` (${String(times)} times)` : '';
  return `- in the ${error.source}: ${place}${endSentence(error.message)}${repetition}`;
}

function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
