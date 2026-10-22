import type { LoggedError } from '../runtime/ErrorSummary.js';

const editorSource = 'editor';
const scriptErrorPattern = /^(Parse|Compile) Error: /;
const failedLoadPattern = /^Failed to load script "(?<path>[^"]+)"/;
const lineSuffixPattern = /:\d+$/;

export function isLoadErrorOf(resourcePaths: readonly string[]): (error: LoggedError) => boolean {
  const checkedPaths = new Set(resourcePaths);
  return (error) => {
    if (error.source !== editorSource) {
      return false;
    }
    const failedPath = failedLoadPattern.exec(error.message)?.groups?.['path'];
    if (failedPath !== undefined) {
      return checkedPaths.has(failedPath);
    }
    const scriptPath = error.location?.replace(lineSuffixPattern, '');
    return scriptPath !== undefined && checkedPaths.has(scriptPath) && scriptErrorPattern.test(error.message);
  };
}
