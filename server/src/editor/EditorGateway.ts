export interface EditorRequestOptions {
  readonly timeoutMs?: number | undefined;
}

export interface EditorGateway {
  request(method: string, params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown>;
}

export class EditorUnavailableError extends Error {
  override readonly name = 'EditorUnavailableError';
}
