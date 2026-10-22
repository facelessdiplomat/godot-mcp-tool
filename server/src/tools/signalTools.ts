import * as z from 'zod/v4';
import type { EditorGateway } from '../editor/EditorGateway.js';
import { changingAnnotations, readingAnnotations } from './annotations.js';
import { BridgeTool } from './bridge/BridgeTool.js';
import { formatNodePath } from './formatting/propertyReports.js';
import { sceneToChange, sceneToRead } from './parameters.js';
import { textResult } from './results.js';

const connectionSchema = z.object({
  from: z.string(),
  signal: z.string(),
  to: z.string(),
  method: z.string(),
  flags: z.array(z.string()),
  binds: z.array(z.unknown()),
});

type Connection = z.infer<typeof connectionSchema>;

const sceneConnectionsSchema = z.object({ scene: z.string(), connections: z.array(connectionSchema) });

type SceneConnections = z.infer<typeof sceneConnectionsSchema>;

const nodeSignalsSchema = z.object({
  scene: z.string(),
  path: z.string(),
  type: z.string(),
  signals: z.array(z.object({ name: z.string(), arguments: z.string(), connections: z.array(connectionSchema) })),
});

type NodeSignals = z.infer<typeof nodeSignalsSchema>;

const signalListSchema = z.union([nodeSignalsSchema, sceneConnectionsSchema]);

export const connectedSignalSchema = connectionSchema.extend({ scene: z.string(), already_connected: z.boolean() });

type ConnectedSignal = z.infer<typeof connectedSignalSchema>;

export const disconnectedSignalSchema = z.object({ scene: z.string(), from: z.string(), signal: z.string(), to: z.string(), method: z.string() });

type DisconnectedSignal = z.infer<typeof disconnectedSignalSchema>;

const signalListInput = z.object({
  path: z
    .string()
    .min(1)
    .optional()
    .describe('A node whose signals to list with their arguments and connections, such as "Door/Area". Default: every saved connection of the scene.'),
  scene: sceneToRead,
});

export function createSignalListTool(editor: EditorGateway): BridgeTool<typeof signalListInput, SceneConnections | NodeSignals> {
  return new BridgeTool(editor, {
    name: 'signal_list',
    definition: {
      title: 'Signals and connections',
      description:
        'List the signal connections saved in a scene, or every signal of one node with its arguments and connections. Use it before signal_connect to learn the signal names and the parameters a method needs.',
      inputSchema: signalListInput,
      annotations: readingAnnotations,
      alwaysLoad: false,
    },
    method: 'signal.list',
    responseSchema: signalListSchema,
    present: (list) => textResult('signals' in list ? describeNodeSignals(list) : describeSceneConnections(list)),
  });
}

function describeSceneConnections(list: SceneConnections): string {
  if (list.connections.length === 0) {
    return `${list.scene} has no saved signal connections. signal_connect adds one.`;
  }
  return [`Signal connections saved in ${list.scene}:`, ...list.connections.map((connection) => `${signalOf(connection)} → ${describeTarget(connection)}`)].join('\n');
}

function describeNodeSignals(list: NodeSignals): string {
  const lines = [`Signals of ${formatNodePath(list.path)} (${list.type}) in ${list.scene}:`];
  for (const signal of list.signals) {
    lines.push(`${signal.name}(${signal.arguments})`, ...signal.connections.map((connection) => `  → ${describeTarget(connection)}`));
  }
  return lines.join('\n');
}

const nodeOfSignal = {
  from: z.string().min(1).describe('Path of the node that emits the signal, such as "Button" or "Door/Area".'),
  signal: z.string().min(1).describe('The signal, such as "pressed" or "body_entered".'),
  to: z.string().min(1).default('.').describe('Path of the node whose method is called. Default: "." (the scene root).'),
  method: z.string().min(1).describe('The method to call, such as "_on_button_pressed".'),
};

export const signalConnectInput = z.object({
  ...nodeOfSignal,
  binds: z.array(z.unknown()).optional().describe('Extra values passed to the method after the signal arguments, such as ["door_a"].'),
  deferred: z.boolean().default(false).describe('Call the method at the end of the frame instead of at once.'),
  one_shot: z.boolean().default(false).describe('Disconnect after the first call.'),
  scene: sceneToChange,
});

export function createSignalConnectTool(editor: EditorGateway): BridgeTool<typeof signalConnectInput, ConnectedSignal> {
  return new BridgeTool(editor, {
    name: 'signal_connect',
    definition: {
      title: 'Connect signal',
      description:
        'Connect a signal of a node to a method of a node in the scene, saved with the scene like a connection made in the editor, as one Undo step. The method must already exist with matching parameters; if it does not, the error names the function to add to the script.',
      inputSchema: signalConnectInput,
      annotations: changingAnnotations({ destructive: false, idempotent: true }),
      alwaysLoad: false,
    },
    method: 'signal.connect',
    responseSchema: connectedSignalSchema,
    present: (connected) =>
      textResult(connected.already_connected ? `${summarizeConnection(connected)}; nothing changed.` : `${summarizeConnection(connected)} in ${connected.scene}. The scene has unsaved changes.`),
  });
}

export function summarizeConnection(connected: Omit<ConnectedSignal, 'scene'>): string {
  return connected.already_connected
    ? `${signalOf(connected)} was already connected to ${describeTarget(connected)}`
    : `Connected ${signalOf(connected)} to ${describeTarget(connected)}`;
}

export const signalDisconnectInput = z.object({ ...nodeOfSignal, scene: sceneToChange });

export function createSignalDisconnectTool(editor: EditorGateway): BridgeTool<typeof signalDisconnectInput, DisconnectedSignal> {
  return new BridgeTool(editor, {
    name: 'signal_disconnect',
    definition: {
      title: 'Disconnect signal',
      description: 'Remove a saved signal connection from a scene, as one Undo step.',
      inputSchema: signalDisconnectInput,
      annotations: changingAnnotations({ destructive: true, idempotent: false }),
      alwaysLoad: false,
    },
    method: 'signal.disconnect',
    responseSchema: disconnectedSignalSchema,
    present: (disconnected) => textResult(`${summarizeDisconnection(disconnected)} in ${disconnected.scene}. The scene has unsaved changes.`),
  });
}

export function summarizeDisconnection(disconnected: Omit<DisconnectedSignal, 'scene'>): string {
  return `Disconnected ${signalOf(disconnected)} from ${disconnected.method}() on ${formatNodePath(disconnected.to)}`;
}

function signalOf(connection: { readonly from: string; readonly signal: string }): string {
  return connection.from === '.' ? `${connection.signal} of the scene root` : `${connection.from}.${connection.signal}`;
}

function describeTarget(connection: Pick<Connection, 'to' | 'method' | 'flags' | 'binds'>): string {
  const flags = connection.flags.length === 0 ? '' : ` [${connection.flags.join(', ')}]`;
  const binds = connection.binds.length === 0 ? '' : ` with binds ${JSON.stringify(connection.binds)}`;
  return `${connection.method}() on ${formatNodePath(connection.to)}${flags}${binds}`;
}
