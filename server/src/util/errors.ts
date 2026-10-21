export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
