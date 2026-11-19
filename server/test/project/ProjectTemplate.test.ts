import { describe, expect, it } from 'vitest';
import { mainSceneText, projectFileText, titleFromFolderName } from '../../src/project/ProjectTemplate.js';

describe('the template of a new project', () => {
  it('writes project.godot with the name, the renderer, Jolt physics, the window and the enabled addon', () => {
    const text = projectFileText({ name: 'Capsule Walk', renderer: 'mobile', windowSize: [1280, 720], versionBranch: '4.8' });

    expect(text).toContain('config_version=5');
    expect(text).toContain('config/name="Capsule Walk"');
    expect(text).toContain('run/main_scene="res://main.tscn"');
    expect(text).toContain('config/features=PackedStringArray("4.8", "Mobile")');
    expect(text).toContain('window/size/viewport_width=1280\nwindow/size/viewport_height=720');
    expect(text).toContain('window/stretch/mode="canvas_items"\nwindow/stretch/aspect="expand"');
    expect(text).toContain('enabled=PackedStringArray("res://addons/godot_mcp_tool/plugin.cfg")');
    expect(text).toContain('3d/physics_engine="Jolt Physics"');
    expect(text).toContain('renderer/rendering_method="mobile"');
  });

  it('warns about declarations without a static type, so that script checks point at untyped code', () => {
    const text = projectFileText({ name: 'Game', renderer: 'forward_plus', windowSize: [1152, 648], versionBranch: '4.8' });

    expect(text).toContain('[debug]\n\ngdscript/warnings/untyped_declaration=1\n');
    expect(text.indexOf('[debug]')).toBeGreaterThan(text.indexOf('[application]'));
    expect(text.indexOf('[debug]')).toBeLessThan(text.indexOf('[display]'));
  });

  it('leaves the version out when it is not known and the renderer setting out for Forward+', () => {
    const text = projectFileText({ name: 'Game', renderer: 'forward_plus', windowSize: [1152, 648], versionBranch: undefined });

    expect(text).toContain('config/features=PackedStringArray("Forward Plus")');
    expect(text).not.toContain('rendering_method');
  });

  it('gives the compatibility renderer to mobile exports too, as the project manager does', () => {
    const text = projectFileText({ name: 'Game', renderer: 'gl_compatibility', windowSize: [1152, 648], versionBranch: '4.8' });

    expect(text).toContain('renderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"');
    expect(text).toContain('config/features=PackedStringArray("4.8", "GL Compatibility")');
  });

  it('starts the main scene with a camera and a light', () => {
    const text = mainSceneText();

    expect(text).toContain('[node name="Main" type="Node3D"]');
    expect(text).toContain('[node name="Camera" type="Camera3D" parent="."]');
    expect(text).toContain('[node name="Sun" type="DirectionalLight3D" parent="."]');
  });

  it('names a project after its folder', () => {
    expect(titleFromFolderName('capsule-walk')).toBe('Capsule Walk');
    expect(titleFromFolderName('my_first_game')).toBe('My First Game');
    expect(titleFromFolderName('Game')).toBe('Game');
  });
});
