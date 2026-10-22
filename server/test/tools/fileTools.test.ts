import type { CallToolResult } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { createFilesystemMoveTool, createResourceFindUsagesTool } from '../../src/tools/fileTools.js';
import { FakeEditorGateway } from '../support/FakeEditorGateway.js';

function textOf(result: CallToolResult): string {
  const [content] = result.content;
  return content?.type === 'text' ? content.text : '';
}

const preloadLine = { path: 'res://crate.gd', line: 3, text: 'const SKIN := preload("res://materials/ice.tres")' };

describe('file tools', () => {
  it('resource_find_usages lists the files, the settings and the code that use a file', async () => {
    const editor = new FakeEditorGateway().respondTo('resource.find_usages', {
      path: 'res://materials/ice.tres',
      uid: 'uid://bice',
      used_by: [{ path: 'res://crate.tscn', uses: ['res://materials/ice.tres'] }],
      settings: [{ name: 'rendering/environment/defaults/default_environment', value: 'res://materials/ice.tres' }],
      code: [preloadLine],
    });

    const result = await createResourceFindUsagesTool(editor).execute({ path: 'res://materials/ice.tres' });

    expect(editor.requests[0]?.params).toEqual({ path: 'res://materials/ice.tres' });
    expect(textOf(result)).toBe(
      [
        'res://materials/ice.tres (uid://bice)',
        'Used by:',
        '- res://crate.tscn',
        'Project settings: rendering/environment/defaults/default_environment = res://materials/ice.tres',
        'Named in code:',
        '- res://crate.gd:3: const SKIN := preload("res://materials/ice.tres")',
      ].join('\n'),
    );
  });

  it('resource_find_usages names the files of a folder that are used, and says when nothing uses a file', async () => {
    const editor = new FakeEditorGateway()
      .respondTo('resource.find_usages', { path: 'res://materials/', uid: '', used_by: [{ path: 'res://crate.tscn', uses: ['res://materials/ice.tres'] }], settings: [], code: [] })
      .respondTo('resource.find_usages', { path: 'res://notes.gd', uid: '', used_by: [], settings: [], code: [] });

    const folder = await createResourceFindUsagesTool(editor).execute({ path: 'res://materials' });
    const unused = await createResourceFindUsagesTool(editor).execute({ path: 'res://notes.gd' });

    expect(textOf(folder)).toBe(['res://materials/ (a folder)', 'Used by:', '- res://crate.tscn: res://materials/ice.tres'].join('\n'));
    expect(textOf(unused)).toBe('Nothing uses res://notes.gd: no scene or resource refers to it, no project setting points at it, and no script names its path or UID.');
  });

  it('filesystem_move reports what it updated and what is left to fix by hand', async () => {
    const editor = new FakeEditorGateway().respondTo('filesystem.move', {
      from: 'res://materials/ice.tres',
      to: 'res://surfaces/ice.tres',
      moved: 1,
      updated: ['res://crate.tscn'],
      not_updated: [{ path: 'res://old.scn', reason: 'a binary file, which only the editor can rewrite; open it and save it again' }],
      settings: [{ name: 'rendering/environment/defaults/default_environment', value: 'res://surfaces/ice.tres' }],
      code: [preloadLine],
    });

    const result = await createFilesystemMoveTool(editor).execute({ from: 'res://materials/ice.tres', to: 'res://surfaces/ice.tres' });

    expect(editor.requests[0]?.params).toEqual({ from: 'res://materials/ice.tres', to: 'res://surfaces/ice.tres' });
    expect(textOf(result)).toBe(
      [
        'Moved res://materials/ice.tres to res://surfaces/ice.tres. Moves are not in the Undo history; move it back with filesystem_move if needed.',
        'Updated the paths in: res://crate.tscn',
        'Not updated:',
        '- res://old.scn: a binary file, which only the editor can rewrite; open it and save it again',
        'Project settings now: rendering/environment/defaults/default_environment = res://surfaces/ice.tres',
        'Scripts still name the old path; change them:',
        '- res://crate.gd:3: const SKIN := preload("res://materials/ice.tres")',
      ].join('\n'),
    );
  });

  it('filesystem_move counts the files of a moved folder', async () => {
    const editor = new FakeEditorGateway().respondTo('filesystem.move', {
      from: 'res://materials/',
      to: 'res://surfaces/',
      moved: 3,
      updated: [],
      not_updated: [],
      settings: [],
      code: [],
    });

    const result = await createFilesystemMoveTool(editor).execute({ from: 'res://materials', to: 'res://surfaces' });

    expect(textOf(result)).toBe('Moved the folder res://materials/ with 3 files to res://surfaces/. Moves are not in the Undo history; move it back with filesystem_move if needed.');
  });
});
