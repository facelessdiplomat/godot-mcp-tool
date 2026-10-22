import { type EditorGateway, type EditorRequestOptions, EditorUnavailableError } from '../editor/EditorGateway.js';

export interface LocalGame extends EditorGateway {
  readonly isRunning: boolean;
}

type GameLocation = 'editor' | 'local';

export class GameGatewayRouter implements EditorGateway {
  private lastRun: GameLocation | undefined;

  constructor(
    private readonly editor: EditorGateway,
    private readonly local: LocalGame,
  ) {}

  async request(method: string, params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown> {
    if (method === 'game.run') {
      return this.run(params, options);
    }
    switch (this.lastRun) {
      case 'local':
        return this.local.request(method, params, options);
      case 'editor':
        return this.editor.request(method, params, options);
      case undefined:
        return this.fromEditorOrLocal(method, params, options);
    }
  }

  private async run(params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown> {
    if (this.local.isRunning) {
      await this.local.request('game.stop', {});
    }
    try {
      const response = await this.editor.request('game.run', params, options);
      this.lastRun = 'editor';
      return response;
    } catch (error) {
      if (!(error instanceof EditorUnavailableError)) {
        throw error;
      }
      this.lastRun = 'local';
      return this.local.request('game.run', params, options);
    }
  }

  private async fromEditorOrLocal(method: string, params: Record<string, unknown>, options?: EditorRequestOptions): Promise<unknown> {
    try {
      return await this.editor.request(method, params, options);
    } catch (error) {
      if (!(error instanceof EditorUnavailableError)) {
        throw error;
      }
      return this.local.request(method, params, options);
    }
  }
}
