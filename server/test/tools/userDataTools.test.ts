import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createUserDataDeleteTool } from '../../src/tools/unsafeTools.js';
import { createUserDataGetTool } from '../../src/tools/userDataTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const userFolder = '/Users/me/Library/Application Support/Godot/app_userdata/Arena';

describe('user data tools', () => {
  it('user_data_get lists the files that the game keeps', async () => {
    const editor = new FakeEditorGateway().respondTo('project.user_data_get', {
      kind: 'folder',
      folder: userFolder,
      path: 'user://',
      entries: [
        { path: 'user://save.json', size: 12, modified: '2026-11-18T17:39:14Z' },
        { path: 'user://logs/godot.log', size: 2048, modified: '2026-11-18T17:39:20Z' },
      ],
      more: false,
    });

    const text = textOf(await createUserDataGetTool(editor).execute({}));

    expect(editor.requests[0]?.params).toEqual({ max_bytes: 8000 });
    expect(text).toBe(
      [
        `The user data of the game is in ${userFolder}.`,
        'user:// holds 2 files:',
        '- user://save.json, 12 bytes, changed 2026-11-18T17:39:14Z',
        '- user://logs/godot.log, 2048 bytes, changed 2026-11-18T17:39:20Z',
      ].join('\n'),
    );
  });

  it('user_data_get shows the text of a file and says when it was cut', async () => {
    const editor = new FakeEditorGateway().respondTo('project.user_data_get', {
      kind: 'file',
      folder: userFolder,
      path: 'user://save.json',
      size: 120,
      modified: '2026-11-18T17:39:14Z',
      text: '{"best": 42',
      truncated: true,
    });

    const text = textOf(await createUserDataGetTool(editor).execute({ path: 'user://save.json', max_bytes: 11 }));

    expect(editor.requests[0]?.params).toEqual({ path: 'user://save.json', max_bytes: 11 });
    expect(text).toBe(
      [
        `user://save.json, 120 bytes, changed 2026-11-18T17:39:14Z, in ${userFolder}:`,
        '{"best": 42',
        'Only the first 11 bytes are shown; read more with a larger max_bytes.',
      ].join('\n'),
    );
  });

  it('user_data_get names a binary file without its contents and an empty folder', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('project.user_data_get', { kind: 'file', folder: userFolder, path: 'user://slot1.dat', size: 4, modified: '2026-11-18T17:39:14Z', binary: true })
      .respondTo('project.user_data_get', { kind: 'folder', folder: userFolder, path: 'user://saves', entries: [], more: false });

    const binary = textOf(await createUserDataGetTool(editor).execute({ path: 'user://slot1.dat' }));
    const empty = textOf(await createUserDataGetTool(editor).execute({ path: 'user://saves' }));

    expect(binary).toBe(`user://slot1.dat, 4 bytes, changed 2026-11-18T17:39:14Z, in ${userFolder}, is a binary file.`);
    expect(empty).toBe(`The user data of the game is in ${userFolder}.\nuser://saves is empty.`);
  });

  it('user_data_delete moves files of the user data to the trash and asks the user first', async () => {
    const editor = new FakeEditorGateway().respondTo('project.user_data_delete', {
      folder: userFolder,
      deleted: ['user://save.json'],
      missing: ['user://old.json'],
      failed: [{ path: 'user://logs', reason: 'Permission denied' }],
    });
    const tool = createUserDataDeleteTool(editor);

    const text = textOf(await tool.execute({ paths: ['user://save.json', 'user://old.json', 'user://logs'] }));

    expect(tool.definition.requiresUserInteraction).toBe(true);
    expect(editor.requests[0]?.params).toEqual({ paths: ['user://save.json', 'user://old.json', 'user://logs'] });
    expect(text).toBe(
      ['Moved to the trash from the user data of the game: user://save.json', 'Not there: user://old.json', 'Could not delete user://logs: Permission denied'].join('\n'),
    );
  });
});
