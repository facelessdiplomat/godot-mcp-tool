import type { EditorGateway, EditorRequestOptions } from '../../src/editor/EditorGateway.js';

export interface RecordedRequest {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly options: EditorRequestOptions | undefined;
}

export class FakeEditorGateway implements EditorGateway {
  readonly requests: RecordedRequest[] = [];
  private readonly queuedOutcomes = new Map<string, unknown[]>();

  respondTo(method: string, ...outcomes: unknown[]): this {
    this.queuedOutcomes.set(method, [...(this.queuedOutcomes.get(method) ?? []), ...outcomes]);
    return this;
  }

  request(method: string, params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown> {
    this.requests.push({ method, params, options });
    const outcome = this.queuedOutcomes.get(method)?.shift();
    if (outcome === undefined) {
      return Promise.reject(new Error(`No fake response for ${method}`));
    }
    if (outcome instanceof Error) {
      return Promise.reject(outcome);
    }
    return Promise.resolve(outcome);
  }
}
