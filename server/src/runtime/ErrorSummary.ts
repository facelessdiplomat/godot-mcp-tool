import * as z from 'zod/v4';

const statusNotification = 'log.status';

const latestErrorSchema = z.object({
  seq: z.number(),
  source: z.string(),
  message: z.string(),
  location: z.string().optional(),
});

type LatestError = z.infer<typeof latestErrorSchema>;

const logStatusSchema = z.object({
  errors: z.number().int(),
  latest_error: latestErrorSchema.optional().catch(undefined),
});

type LogStatus = z.infer<typeof logStatusSchema>;

export class ErrorSummary {
  private connection: number | undefined;
  private reportedErrors = 0;
  private latest: LogStatus | undefined;

  observe(connection: number, method: string, params: unknown): void {
    if (method !== statusNotification) {
      return;
    }
    const status = logStatusSchema.safeParse(params);
    if (!status.success) {
      return;
    }
    if (connection !== this.connection) {
      this.connection = connection;
      this.reportedErrors = status.data.errors;
    }
    this.latest = status.data;
  }

  acknowledge(): void {
    if (this.latest !== undefined) {
      this.reportedErrors = this.latest.errors;
    }
  }

  takeSummary(): string | undefined {
    if (this.latest === undefined) {
      return undefined;
    }
    const newErrors = this.latest.errors - this.reportedErrors;
    this.reportedErrors = this.latest.errors;
    if (newErrors <= 0) {
      return undefined;
    }
    const count = `${String(newErrors)} new ${newErrors === 1 ? 'error' : 'errors'}`;
    return `⚠ ${count} since the last call. ${describeLatest(this.latest.latest_error)}Read them with game_get_output.`;
  }
}

function describeLatest(error: LatestError | undefined): string {
  if (error === undefined) {
    return '';
  }
  const place = error.location === undefined ? '' : `${error.location}: `;
  return `Latest, in the ${error.source}: ${place}${endSentence(error.message)} `;
}

function endSentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
