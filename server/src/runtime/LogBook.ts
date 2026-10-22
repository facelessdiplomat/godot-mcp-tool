export type LogBookEntry = Readonly<Record<string, unknown>> & { readonly seq: number; readonly source: string };

export interface LogPage {
  readonly entries: readonly LogBookEntry[];
  readonly more: boolean;
  readonly next_after: number;
  readonly skipped: number;
  readonly last_seq: number;
}

const defaultCapacity = 2000;

export class LogBook {
  private readonly entries: LogBookEntry[] = [];
  private sequence = 0;

  constructor(private readonly capacity = defaultCapacity) {}

  get lastSeq(): number {
    return this.sequence;
  }

  append(entry: Readonly<Record<string, unknown>>, source: string): void {
    this.sequence += 1;
    this.entries.push({ ...entry, seq: this.sequence, source });
    if (this.entries.length > this.capacity) {
      this.entries.shift();
    }
  }

  entriesAfter(afterSeq: number, levels: readonly string[], limit: number): LogPage {
    const oldestSeq = this.entries[0]?.seq ?? this.sequence + 1;
    const selected: LogBookEntry[] = [];
    let nextAfter = this.sequence;
    let more = false;
    for (const entry of this.entries) {
      if (entry.seq <= afterSeq || !matchesLevel(entry, levels)) {
        continue;
      }
      if (selected.length >= limit) {
        more = true;
        nextAfter = selected[selected.length - 1]?.seq ?? afterSeq;
        break;
      }
      selected.push(entry);
    }
    return {
      entries: selected,
      more,
      next_after: Math.max(nextAfter, afterSeq),
      skipped: Math.max(0, oldestSeq - afterSeq - 1),
      last_seq: this.sequence,
    };
  }
}

function matchesLevel(entry: LogBookEntry, levels: readonly string[]): boolean {
  const level = entry['level'];
  return levels.length === 0 || (typeof level === 'string' && levels.includes(level));
}
