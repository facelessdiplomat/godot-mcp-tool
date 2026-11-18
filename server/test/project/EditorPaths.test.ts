import { describe, expect, it } from 'vitest';
import { canonicalEditorPath, editorPathOf, editorPathOfUri, fileUriOf, isSameEditorPath, resourcePathOfEditorPath } from '../../src/project/EditorPaths.js';

describe('paths as the Godot editor sees them', () => {
  it('puts a resource of the project under the project folder of the editor with forward slashes on every system', () => {
    expect(editorPathOf('/editor/sees/project', 'res://enemies/goblin.gd')).toBe('/editor/sees/project/enemies/goblin.gd');
    expect(editorPathOf('C:/Users/ada/arena/', 'res://player.gd')).toBe('C:/Users/ada/arena/player.gd');
  });

  it('finds the resource path of a file in the project folder of the editor, and nothing outside it', () => {
    expect(resourcePathOfEditorPath('C:/Users/ada/arena', 'c:/Users/ada/arena/enemies/goblin.gd')).toBe('res://enemies/goblin.gd');
    expect(resourcePathOfEditorPath('/projects/arena', '/projects/arena/player.gd')).toBe('res://player.gd');
    expect(resourcePathOfEditorPath('/projects/arena', '/projects/arena2/player.gd')).toBeUndefined();
  });

  it('turns editor paths into file URIs and back, with drive letters and characters that URIs encode', () => {
    expect(fileUriOf('/projects/arena/player.gd')).toBe('file:///projects/arena/player.gd');
    expect(fileUriOf('C:/Users/ada/my game/player.gd')).toBe('file:///C:/Users/ada/my%20game/player.gd');
    expect(fileUriOf('/projects/100%/a#b.gd')).toBe('file:///projects/100%25/a%23b.gd');
    expect(editorPathOfUri('file:///projects/arena/player.gd')).toBe('/projects/arena/player.gd');
    expect(editorPathOfUri('file:///C:/Users/ada/my%20game/player.gd')).toBe('C:/Users/ada/my game/player.gd');
    expect(editorPathOfUri('file:///c%3A/Users/ada/arena/player.gd')).toBe('C:/Users/ada/arena/player.gd');
    expect(editorPathOfUri(fileUriOf('/projects/100%/a#b.gd'))).toBe('/projects/100%/a#b.gd');
  });

  it('compares editor paths regardless of the case of the drive letter, backslashes and a trailing slash', () => {
    expect(canonicalEditorPath('c:\\Users\\ada\\arena\\')).toBe('C:/Users/ada/arena');
    expect(isSameEditorPath('C:/Users/ada/arena', 'c:\\Users\\ada\\arena')).toBe(true);
    expect(isSameEditorPath('/projects/arena', '/projects/arena/')).toBe(true);
    expect(isSameEditorPath('/projects/arena', '/projects/arena2')).toBe(false);
  });
});
