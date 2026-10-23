import { describe, expect, it } from 'vitest';
import { withoutConfirmationMarks } from './serverWithoutConfirmations.js';

describe('the server without confirmations of the evaluation runs', () => {
  it('removes the mark that makes Claude Code ask the user from the listed tools', () => {
    const listing = {
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [
          { name: 'filesystem_delete', _meta: { 'anthropic/requiresUserInteraction': true } },
          { name: 'editor_run_script', _meta: { 'anthropic/requiresUserInteraction': true, 'anthropic/alwaysLoad': true } },
          { name: 'godot_status', _meta: { 'anthropic/alwaysLoad': true } },
          { name: 'scene_save' },
        ],
        nextCursor: 'later',
      },
    };

    expect(withoutConfirmationMarks(listing)).toEqual({
      jsonrpc: '2.0',
      id: 2,
      result: {
        tools: [
          { name: 'filesystem_delete' },
          { name: 'editor_run_script', _meta: { 'anthropic/alwaysLoad': true } },
          { name: 'godot_status', _meta: { 'anthropic/alwaysLoad': true } },
          { name: 'scene_save' },
        ],
        nextCursor: 'later',
      },
    });
  });

  it('passes every other message through unchanged', () => {
    const call = { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'Moved res://level.tscn.' }] } };
    const notification = { jsonrpc: '2.0', method: 'notifications/tools/list_changed' };

    expect(withoutConfirmationMarks(call)).toBe(call);
    expect(withoutConfirmationMarks(notification)).toBe(notification);
  });
});
