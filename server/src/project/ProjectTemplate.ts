import { addonPluginPath } from '../addon/PluginActivation.js';

export type Renderer = 'forward_plus' | 'mobile' | 'gl_compatibility';

export interface ProjectTemplateOptions {
  readonly name: string;
  readonly renderer: Renderer;
  readonly windowSize: readonly [number, number];
  readonly versionBranch: string | undefined;
}

export const mainScenePath = 'res://main.tscn';

const rendererFeatures: Readonly<Record<Renderer, string>> = { forward_plus: 'Forward Plus', mobile: 'Mobile', gl_compatibility: 'GL Compatibility' };
const wordSeparators = /[-_\s]+/;

export function projectFileText(options: ProjectTemplateOptions): string {
  const features = [...(options.versionBranch === undefined ? [] : [options.versionBranch]), rendererFeatures[options.renderer]];
  const rendering = [
    ...(options.renderer === 'forward_plus' ? [] : [`renderer/rendering_method="${options.renderer}"`]),
    ...(options.renderer === 'gl_compatibility' ? ['renderer/rendering_method.mobile="gl_compatibility"'] : []),
    'rendering_device/driver.windows="d3d12"',
    'lights_and_shadows/multi_bounce_occlusion/enabled=true',
  ];
  return [
    '; Engine configuration file.',
    "; It's best edited using the editor UI and not directly,",
    '; since the parameters that go here are not all obvious.',
    ';',
    '; Format:',
    ';   [section] ; section goes between []',
    ';   param=value ; assign values to parameters',
    '',
    'config_version=5',
    '',
    '[application]',
    '',
    `config/name=${quoted(options.name)}`,
    `run/main_scene="${mainScenePath}"`,
    `config/features=PackedStringArray(${features.map(quoted).join(', ')})`,
    '',
    '[display]',
    '',
    `window/size/viewport_width=${String(options.windowSize[0])}`,
    `window/size/viewport_height=${String(options.windowSize[1])}`,
    'window/stretch/mode="canvas_items"',
    'window/stretch/aspect="expand"',
    '',
    '[editor_plugins]',
    '',
    `enabled=PackedStringArray("${addonPluginPath}")`,
    '',
    '[input_devices]',
    '',
    'joypads/ignore_joypad_on_unfocused_application=true',
    '',
    '[physics]',
    '',
    '3d/physics_engine="Jolt Physics"',
    '',
    '[rendering]',
    '',
    ...rendering,
    '',
  ].join('\n');
}

export function mainSceneText(): string {
  return [
    '[gd_scene format=3]',
    '',
    '[node name="Main" type="Node3D"]',
    '',
    '[node name="Camera" type="Camera3D" parent="."]',
    'transform = Transform3D(1, 0, 0, 0, 0.939693, 0.34202, 0, -0.34202, 0.939693, 0, 3, 6)',
    '',
    '[node name="Sun" type="DirectionalLight3D" parent="."]',
    'transform = Transform3D(1, 0, 0, 0, 0.642788, 0.766044, 0, -0.766044, 0.642788, 0, 5, 0)',
    'shadow_enabled = true',
    '',
  ].join('\n');
}

export const gitignoreText = ['# Godot 4+ specific ignores', '.godot/', '/android/', ''].join('\n');

export const gitattributesText = ['# Normalize EOL for all files that Git considers text files.', '* text=auto eol=lf', ''].join('\n');

export const editorconfigText = ['root = true', '', '[*]', 'charset = utf-8', ''].join('\n');

export function titleFromFolderName(folderName: string): string {
  return folderName
    .split(wordSeparators)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function quoted(text: string): string {
  return JSON.stringify(text);
}
