export class BridgeProtocolError extends Error {
  override readonly name = 'BridgeProtocolError';
}

export class BridgeConnectionError extends Error {
  override readonly name = 'BridgeConnectionError';
}

export class BridgeRequestError extends Error {
  override readonly name = 'BridgeRequestError';

  constructor(
    message: string,
    readonly code: number,
    readonly hint: string | undefined,
    readonly data: unknown,
  ) {
    super(message);
  }
}
