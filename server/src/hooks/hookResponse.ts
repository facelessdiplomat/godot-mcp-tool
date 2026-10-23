import type { EditedScriptOutcome } from './EditedScriptCheck.js';

export interface HookResponse {
  readonly exitCode: number;
  readonly standardOutput: readonly string[];
  readonly standardError: readonly string[];
}

const exitCodeShownToClaude = 2;

export function respondToEditedScript(outcome: EditedScriptOutcome): HookResponse {
  if (outcome.kind === 'silent') {
    return { exitCode: 0, standardOutput: [], standardError: [] };
  }
  if (outcome.hasErrors) {
    return { exitCode: exitCodeShownToClaude, standardOutput: [], standardError: outcome.report.split('\n') };
  }
  return {
    exitCode: 0,
    standardOutput: [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: outcome.report } })],
    standardError: [],
  };
}
