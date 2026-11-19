import { describe, expect, it } from 'vitest';
import { areChangesHeld } from '../../src/editor/ChangesHold.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

describe('asking the editor whether the user holds changes', () => {
  it('reads the answer of ping', async () => {
    expect(await areChangesHeld(new FakeEditorGateway().respondTo('ping', { pong: true, changes_held: true }))).toBe(true);
    expect(await areChangesHeld(new FakeEditorGateway().respondTo('ping', { pong: true, changes_held: false }))).toBe(false);
  });

  it('takes an addon that does not know the switch for one that holds nothing', async () => {
    expect(await areChangesHeld(new FakeEditorGateway().respondTo('ping', { pong: true }))).toBe(false);
  });
});
