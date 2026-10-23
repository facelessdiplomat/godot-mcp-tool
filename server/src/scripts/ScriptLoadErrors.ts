import type { LoggedError } from '../runtime/ErrorSummary.js';

const editorSource = 'editor';
const scriptErrorPattern = /^(Parse|Compile) Error: /;
const failedLoadPattern = /^Failed to load script "(?<path>[^"]+)"/;
const lineSuffixPattern = /:\d+$/;

export function isLoadErrorOf(resourcePaths: readonly string[]): (error: LoggedError) => boolean {
  const checkedPaths = new Set(resourcePaths);
  return (error) => {
    const scriptPath = scriptOfLoadError(error);
    return scriptPath !== undefined && checkedPaths.has(scriptPath);
  };
}

export function scriptOfLoadError(error: LoggedError): string | undefined {
  if (error.source !== editorSource) {
    return undefined;
  }
  const failedPath = failedLoadPattern.exec(error.message)?.groups?.['path'];
  if (failedPath !== undefined) {
    return failedPath;
  }
  const scriptPath = error.location?.replace(lineSuffixPattern, '');
  return scriptPath !== undefined && scriptErrorPattern.test(error.message) ? scriptPath : undefined;
}
