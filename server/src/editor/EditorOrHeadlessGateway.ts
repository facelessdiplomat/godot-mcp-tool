import { type EditorGateway, type EditorRequestOptions, EditorUnavailableError } from './EditorGateway.js';

export class EditorOrHeadlessGateway implements EditorGateway {
  constructor(
    private readonly editor: EditorGateway,
    private readonly headless: EditorGateway,
  ) {}

  async request(method: string, params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown> {
    try {
      return await this.editor.request(method, params, options);
    } catch (error) {
      if (!(error instanceof EditorUnavailableError)) {
        throw error;
      }
      return this.headless.request(method, params, options);
    }
  }
}
