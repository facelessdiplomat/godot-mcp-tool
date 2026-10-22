import { type EditorGateway, type EditorRequestOptions, EditorUnavailableError } from '../editor/EditorGateway.js';
import { describeError } from '../util/errors.js';
import type { EditorBridge, HelloResult } from './BridgeClient.js';
import type { BridgeEndpoint, DiscoverySource } from './DiscoveryFileReader.js';

export type EditorStatus =
  | { readonly connected: true; readonly hello: HelloResult }
  | { readonly connected: false; readonly reason: string };

export interface EditorStatusProvider {
  status(): Promise<EditorStatus>;
}

export type ConnectionNotificationListener = (connectionNumber: number, method: string, params: unknown) => void;

export interface EditorSession extends EditorStatusProvider, EditorGateway {
  onNotification(listener: ConnectionNotificationListener): void;
  close(): void;
}

export class EditorConnection implements EditorSession {
  private bridge: EditorBridge | undefined;
  private hello: HelloResult | undefined;
  private connectionInProgress: Promise<EditorStatus> | undefined;
  private connectionCount = 0;
  private readonly notificationListeners: ConnectionNotificationListener[] = [];

  constructor(
    private readonly discovery: DiscoverySource,
    private readonly createBridge: (endpoint: BridgeEndpoint) => EditorBridge,
  ) {}

  async status(): Promise<EditorStatus> {
    if (this.bridge?.isOpen === true && this.hello !== undefined) {
      return { connected: true, hello: this.hello };
    }
    if (this.connectionInProgress !== undefined) {
      return this.connectionInProgress;
    }
    this.connectionInProgress = this.discoverAndConnect();
    try {
      return await this.connectionInProgress;
    } finally {
      this.connectionInProgress = undefined;
    }
  }

  async request(method: string, params: Record<string, unknown>, options: EditorRequestOptions = {}): Promise<unknown> {
    const editorStatus = await this.status();
    if (!editorStatus.connected) {
      throw new EditorUnavailableError(editorStatus.reason);
    }
    if (this.bridge === undefined) {
      throw new EditorUnavailableError('The connection to the editor closed before the request was sent.');
    }
    return this.bridge.request(method, params, options.timeoutMs);
  }

  onNotification(listener: ConnectionNotificationListener): void {
    this.notificationListeners.push(listener);
  }

  close(): void {
    this.bridge?.close();
    this.bridge = undefined;
    this.hello = undefined;
  }

  private async discoverAndConnect(): Promise<EditorStatus> {
    const discovered = this.discovery.read();
    switch (discovered.kind) {
      case 'missing':
        return {
          connected: false,
          reason: `The Godot editor is not running for this project, or the "Godot MCP Tool" plugin is disabled (no ${discovered.path}).`,
        };
      case 'stale':
        return {
          connected: false,
          reason: `The discovery file ${discovered.path} belongs to process ${String(discovered.pid)}, which is no longer running. Open the project in the Godot editor again.`,
        };
      case 'invalid':
        return { connected: false, reason: `The discovery file ${discovered.path} is invalid: ${discovered.reason}` };
      case 'found':
        return this.connectTo(discovered.endpoint);
    }
  }

  private async connectTo(endpoint: BridgeEndpoint): Promise<EditorStatus> {
    this.close();
    const bridge = this.createBridge(endpoint);
    this.connectionCount += 1;
    const connectionNumber = this.connectionCount;
    bridge.onNotification((method, params) => {
      for (const listener of this.notificationListeners) {
        listener(connectionNumber, method, params);
      }
    });
    try {
      const hello = await bridge.connect();
      this.bridge = bridge;
      this.hello = hello;
      return { connected: true, hello };
    } catch (error) {
      bridge.close();
      return {
        connected: false,
        reason: `Could not connect to the editor bridge on 127.0.0.1:${String(endpoint.port)}: ${describeError(error)}`,
      };
    }
  }
}

export class UnavailableEditor implements EditorSession {
  constructor(private readonly reason: string) {}

  status(): Promise<EditorStatus> {
    return Promise.resolve({ connected: false, reason: this.reason });
  }

  request(_method: string, _params: Record<string, unknown>): Promise<unknown> {
    return Promise.reject(new EditorUnavailableError(this.reason));
  }

  onNotification(): void {}

  close(): void {}
}
