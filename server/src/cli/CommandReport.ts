export interface CommandReport {
  readonly succeeded: boolean;
  readonly lines: readonly string[];
}

export function succeeded(...lines: readonly string[]): CommandReport {
  return { succeeded: true, lines };
}

export function failed(...lines: readonly string[]): CommandReport {
  return { succeeded: false, lines };
}
