export type ProblemSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface ScriptProblem {
  readonly file?: string;
  readonly line: number;
  readonly column?: number;
  readonly severity: ProblemSeverity;
  readonly code?: string;
  readonly message: string;
}
