import type { EditedScriptOutcome } from './EditedScriptCheck.js';
import type { SceneEditOutcome } from './SceneEditGuard.js';

export interface HookResponse {
  readonly exitCode: number;
  readonly standardOutput: readonly string[];
  readonly standardError: readonly string[];
}

const exitCodeShownToClaude = 2;
const nothingToSay: HookResponse = { exitCode: 0, standardOutput: [], standardError: [] };

export function respondToEditedScript(outcome: EditedScriptOutcome): HookResponse {
  if (outcome.kind === 'silent') {
    return nothingToSay;
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

export function respondToSceneEdit(outcome: SceneEditOutcome): HookResponse {
  if (outcome.kind === 'silent') {
    return nothingToSay;
  }
  return {
    exitCode: 0,
    standardOutput: [JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: outcome.reason } })],
    standardError: [],
  };
}
