import type { ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeCaptureScene } from './captureScene.js';
import { editorStartupTimeoutMs, godotBinary, type ImageOutcome, McpSession, startWindowedEditor, TemporaryProject } from './harness.js';
import { decodePng, type PngImage, type Rgb } from './pngImage.js';

const windowTestsEnabled = process.env['GODOT_MCP_WINDOW_TESTS'] === '1';

const menuScene = [
  '[gd_scene format=3]',
  '',
  '[node name="Menu" type="Control"]',
  'layout_mode = 3',
  'anchors_preset = 15',
  'anchor_right = 1.0',
  'anchor_bottom = 1.0',
  '',
  '[node name="Resume" type="Button" parent="."]',
  'layout_mode = 0',
  'offset_left = 40.0',
  'offset_top = 40.0',
  'offset_right = 200.0',
  'offset_bottom = 90.0',
  'toggle_mode = true',
  'text = "Resume"',
  '',
].join('\n');

const darkScene = [
  '[gd_scene load_steps=4 format=3]',
  '',
  '[sub_resource type="StandardMaterial3D" id="Material_green"]',
  'albedo_color = Color(0, 1, 0, 1)',
  '',
  '[sub_resource type="BoxMesh" id="BoxMesh_box"]',
  'material = SubResource("Material_green")',
  'size = Vector3(2, 2, 2)',
  '',
  '[sub_resource type="Environment" id="Environment_dark"]',
  'background_mode = 1',
  'background_color = Color(0, 0, 0, 1)',
  'ambient_light_source = 2',
  'ambient_light_color = Color(0, 0, 0, 1)',
  'ambient_light_energy = 0.0',
  'reflected_light_source = 1',
  '',
  '[node name="Dark" type="Node3D"]',
  '',
  '[node name="Box" type="MeshInstance3D" parent="."]',
  'mesh = SubResource("BoxMesh_box")',
  '',
  '[node name="Environment" type="WorldEnvironment" parent="."]',
  'environment = SubResource("Environment_dark")',
  '',
  '[node name="Lamp" type="OmniLight3D" parent="."]',
  'transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -20, 0)',
  'light_energy = 0.0',
  '',
].join('\n');

function isGreen([red, green, blue]: Rgb): boolean {
  return green > 200 && red < 60 && blue < 60;
}

function isDark([red, green, blue]: Rgb): boolean {
  return red < 40 && green < 40 && blue < 40;
}

function decodedImage(outcome: ImageOutcome): PngImage {
  if (outcome.image === undefined) {
    throw new Error(`The result has no image: ${outcome.text}`);
  }
  return decodePng(outcome.image);
}

function centerOf(image: PngImage): Rgb {
  return image.pixel(Math.floor(image.width / 2), Math.floor(image.height / 2));
}

function isRed([red, green, blue]: Rgb): boolean {
  return red > 200 && green < 60 && blue < 60;
}

describe.skipIf(godotBinary === '' || !windowTestsEnabled)('screenshots with a window', () => {
  let project: TemporaryProject | undefined;
  let editorProcess: ChildProcess | undefined;
  let session: McpSession | undefined;

  function tools(): McpSession {
    if (session === undefined) {
      throw new Error('The MCP client is not connected');
    }
    return session;
  }

  beforeAll(async () => {
    project = new TemporaryProject('MCP screenshots', { mainScene: 'res://main.tscn' });
    writeCaptureScene(project);
    project.write('menu.tscn', menuScene);
    project.write('dark.tscn', darkScene);
    editorProcess = await startWindowedEditor(project.root);
    session = await McpSession.connect(project.root);
    await session.call('scene_open', { path: 'res://main.tscn' });
  }, editorStartupTimeoutMs);

  afterAll(async () => {
    await session?.call('game_stop');
    await session?.close();
    editorProcess?.kill('SIGKILL');
    project?.remove();
  });

  it('renders a node from a preset angle in the editor', async () => {
    const outcome = await tools().callForImage('editor_screenshot', { views: [{ preset: 'front', target: 'Crate' }] });
    const image = decodedImage(outcome);

    expect(outcome.text).toContain('View of res://main.tscn, 1280×720: front of Crate.');
    expect(outcome.text).not.toContain('preview');
    expect([image.width, image.height]).toEqual([1280, 720]);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it('shows the colors of an unlit scene in an unshaded view, which a lit view shows dark', async () => {
    await tools().call('scene_open', { path: 'res://dark.tscn' });
    const lit = decodedImage(await tools().callForImage('editor_screenshot', { views: [{ preset: 'front', target: 'Box' }] }));
    const unshaded = await tools().callForImage('editor_screenshot', { views: [{ preset: 'front', target: 'Box', render: 'unshaded' }] });
    await tools().call('scene_open', { path: 'res://main.tscn' });

    expect(unshaded.text).toContain('front of Box, unshaded');
    expect(isDark(centerOf(lit))).toBe(true);
    expect(isGreen(centerOf(decodedImage(unshaded)))).toBe(true);
  });

  it('compares a view with an earlier one: the same scene matches, a moved crate is outlined', async () => {
    const view = { views: [{ position: [0, 6, 14], look_at: [0, 0, 0] }] };
    const first = await tools().callForImage('editor_screenshot', view);
    const earlier = /Saved to (?<path>.+)$/m.exec(first.text)?.groups?.['path'] ?? '';
    const same = await tools().callForImage('editor_screenshot', { ...view, compare_to: earlier });
    await tools().call('node_set_properties', { path: 'Crate', properties: { position: [-4, 1, 0] } });
    const moved = await tools().callForImage('editor_screenshot', { ...view, compare_to: earlier });
    await tools().call('editor_undo');

    expect(earlier).toMatch(/\.png$/);
    expect(same.text).toContain(`Compared with ${earlier}: no pixel changed by more than 0.1, so the pictures match`);
    expect(moved.text).toMatch(/Compared with .+: [\d.]+% of the pixels changed by more than 0\.1, all within \[\d+, \d+, \d+, \d+\]/);
  });

  it('lays several editor views out in one image', async () => {
    const outcome = await tools().callForImage('editor_screenshot', { views: ['front', 'top', 'iso'] });
    const image = decodedImage(outcome);

    expect(outcome.text).toContain('Views of res://main.tscn, 1280×724, left to right and top to bottom: front, top, iso.');
    expect([image.width, image.height]).toEqual([1280, 724]);
  });

  it('renders from the editor camera', async () => {
    const outcome = await tools().callForImage('editor_screenshot');
    const image = decodedImage(outcome);

    expect(outcome.text).toContain(`from the editor camera, without the grid and gizmos, ${String(image.width)}×${String(image.height)}.`);
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1280);
  });

  it('poses the crate along an animation and leaves it where it was', async () => {
    await tools().call('node_add', { type: 'AnimationPlayer', name: 'AnimationPlayer' });
    await tools().call('animation_set', {
      player: 'AnimationPlayer',
      name: 'rise',
      length: 1,
      tracks: [{ path: 'Crate:position', keys: [{ time: 0, value: [4, 1, 0] }, { time: 1, value: [4, 4, 0] }] }],
    });

    const outcome = await tools().callForImage('editor_screenshot', {
      views: [{ position: [4, 2.5, 12], look_at: [4, 2.5, 0], label: 'side' }],
      animation: { player: 'AnimationPlayer', name: 'rise', times: [0, 1] },
    });
    const crate = await tools().call('node_get_properties', { path: 'Crate', names: ['position'] });
    const image = decodedImage(outcome);
    const cellWidth = (image.width - 8) / 2;
    const middle = Math.floor(image.height / 2);
    const quarterCell = Math.floor(image.height / 8);

    expect(outcome.text).toContain('Poses of res://main.tscn from side at rise at 0 s; rise at 1 s, in one labelled image');
    expect(crate.text).toContain('position = Vector3(4, 1, 0)');
    expect(isRed(image.pixel(Math.floor(cellWidth / 2), middle + quarterCell))).toBe(true);
    expect(isRed(image.pixel(Math.floor(cellWidth / 2), middle - quarterCell))).toBe(false);
    expect(isRed(image.pixel(Math.floor(cellWidth * 1.5) + 8, middle - quarterCell))).toBe(true);
    expect(isRed(image.pixel(Math.floor(cellWidth * 1.5) + 8, middle + quarterCell))).toBe(false);
  });

  it('renders a UI scene at two window sizes side by side and measures its button', async () => {
    await tools().call('scene_open', { path: 'res://menu.tscn' });
    const outcome = await tools().callForImage('editor_screenshot', { sizes: [[1920, 1080], [1440, 1080]] });
    const button = await tools().call('node_get_bounds', { path: 'Resume' });
    await tools().call('scene_open', { path: 'res://main.tscn' });
    const image = decodedImage(outcome);
    const scale = image.width / (1920 * 2 + 8);
    const brightness = ([red, green, blue]: Rgb): number => red + green + blue;
    const buttonCenter = (cellLeft: number): Rgb => image.pixel(Math.round((cellLeft + 120) * scale), Math.round(65 * scale));
    const background = (cellLeft: number): Rgb => image.pixel(Math.round((cellLeft + 600) * scale), Math.round(600 * scale));

    expect(outcome.text).toContain('Render of res://menu.tscn at 1920×1080 (16:9); 1440×1080 (4:3), laid out like the game window');
    expect(button.text).toContain('Resume (Button) in res://menu.tscn, in canvas pixels:');
    expect(button.text).toContain('from Vector2(40, 40) to Vector2(200, 90)');
    expect(button.text).toContain('It lies inside the Vector2(1152, 648) window of the project.');
    expect(brightness(buttonCenter(0))).not.toBe(brightness(background(0)));
    expect(brightness(buttonCenter(1928))).not.toBe(brightness(background(1928)));
  });

  it('takes a screenshot of the game window', async () => {
    await tools().call('game_run');

    const outcome = await tools().callForImage('game_screenshot');
    const image = decodedImage(outcome);

    expect(outcome.text).toContain(`Screenshot of the running game (res://main.tscn), ${String(image.width)}×${String(image.height)}.`);
    expect(isRed(centerOf(image))).toBe(true);
  });

  it('renders a view of the running game and leaves its camera alone', async () => {
    const view = await tools().callForImage('game_screenshot', { views: [{ preset: 'top', target: 'Crate' }] });
    const window = await tools().callForImage('game_screenshot');

    expect(view.text).toContain('View of the running game (res://main.tscn), 1280×720: top of Crate.');
    expect(isRed(centerOf(decodedImage(view)))).toBe(true);
    expect(isRed(centerOf(decodedImage(window)))).toBe(true);
  });

  it('renders an unshaded view of the running game, and refuses its wireframe', async () => {
    const unshaded = await tools().callForImage('game_screenshot', { views: [{ preset: 'front', target: 'Crate', render: 'unshaded' }] });
    const wireframe = await tools().call('game_screenshot', { views: [{ preset: 'front', render: 'wireframe' }] });

    expect(isRed(centerOf(decodedImage(unshaded)))).toBe(true);
    expect(wireframe.isError).toBe(true);
    expect(wireframe.text).toContain('editor_screenshot');
  });

  it('takes a screenshot right after playing input', async () => {
    const outcome = await tools().callForImage('game_input', { steps: [{ wait_ms: 100 }], screenshot: true });

    expect(outcome.text).toContain('Played 1 input step in');
    expect(outcome.text).toContain('Screenshot of the running game (res://main.tscn)');
    expect(isRed(centerOf(decodedImage(outcome)))).toBe(true);
  });

  it('puts screenshots of several moments of an input into one labelled image', async () => {
    const outcome = await tools().callForImage('game_input', { steps: [{ screenshot: true }, { wait_physics_frames: 5 }, { screenshot: true }], screenshot: true });
    const image = decodedImage(outcome);

    expect(outcome.text).toMatch(/Screenshots of the running game \(res:\/\/main\.tscn\) at step 1, frame [01]; step 3, frame [56]; end, frame [567], in one labelled image, 1280×\d+\./);
    expect(image.width).toBe(1280);
    expect(isRed(image.pixel(Math.floor(image.width / 4), Math.floor(image.height / 4)))).toBe(true);
  });

  it('takes a strip of frames of the game window', async () => {
    const outcome = await tools().callForImage('game_screenshot', { frames: 3, every_physics_frames: 10 });
    const image = decodedImage(outcome);

    const frames = /at frame (?<first>\d+); frame (?<second>\d+); frame (?<third>\d+), in one labelled image/.exec(outcome.text)?.groups ?? {};
    const [first = -1, second = -1, third = -1] = [frames['first'], frames['second'], frames['third']].map(Number);

    expect(outcome.text).toContain('Screenshots of the running game (res://main.tscn) at frame ');
    expect(first).toBeLessThanOrEqual(1);
    expect([second - first, third - second]).toEqual([10, 10]);
    expect(isRed(image.pixel(Math.floor(image.width / 4), Math.floor(image.height / 4)))).toBe(true);
  });

  it('sends a jpeg on request', async () => {
    const outcome = await tools().callForImage('game_screenshot', { format: 'jpeg', max_size: 640 });

    expect(outcome.mimeType).toBe('image/jpeg');
    expect(outcome.text).toMatch(/Saved to .+\.jpg$/m);
  });

  it('clicks a Control by its path', async () => {
    await tools().call('game_run', { scene: 'res://menu.tscn' });

    const listed = await tools().call('game_get_tree', { controls: true });
    const clicked = await tools().call('game_input', { steps: [{ click: 'Resume' }] });
    const button = await tools().call('game_get_properties', { path: 'Resume', names: ['button_pressed'] });

    expect(listed.text).toContain('Resume: Button "Resume" [40, 40, 160, 50]');
    expect(clicked.text).toContain('Step 1 clicked Resume at [120, 65].');
    expect(button.text).toContain('button_pressed = true');
  });
});
