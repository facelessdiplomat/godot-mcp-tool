# Pictures and the recording

The pictures of the READMEs live here. The npm package takes only `dist` and `addon`, so they do not make it larger;
`server/README.md`, the page on npm, links to them on `raw.githubusercontent.com`.

## arena-views.jpg

What Claude sees with `editor_screenshot`: the arena of the quick start from four angles. The scene is the reference
solution of the scenario `build-an-arena` (a 30 × 30 m floor, walls, a platform with a ramp, a sun and a sky), with a
material on each part, three crates and a capsule added with `scene_batch_edit`. One call took the picture, saved as
a JPEG at quality 88:

```json
{
  "views": [
    { "position": [22, 19, 22], "look_at": [0, -1, 0], "label": "iso" },
    { "position": [0, 37, 0.5], "look_at": [0, 0, 0], "label": "top" },
    { "position": [-11, 4, 12], "look_at": [6, 0, -8], "label": "from a corner" },
    { "preset": "iso", "target": "Ramp" }
  ],
  "max_size": 1600
}
```

The first two views place their cameras, because a preset frames the bounding sphere of the whole scene and leaves a
flat arena at about half the height of the view.

## A recording, for later

Not made for 0.3.0, by the decision of 2026-11-19; the script stays for a later version.

A screen recording of 30 to 40 seconds for the top of both READMEs, in which Claude Code builds the arena of the quick
start in the open editor.

**Setup.** A new project from `npx godot-mcp-tool init arena-demo`, open in the Godot editor with its empty 3D main
scene, and the Claude Code plugin installed. Claude Code runs in a terminal on the left third of the screen, with a
large font; the editor fills the other two thirds, so that the nodes can be seen as they appear in the 3D view.

**Script.**

1. 0–5 s: the first task of the README is typed into Claude Code: "Build a small arena with walls and a ramp, and show
   it from a few angles."
2. 5–25 s: the floor, the walls, the platform, the ramp, the sun and the sky appear in the editor as Claude builds
   them. If this takes longer, the recording speeds it up.
3. 25–33 s: the picture of the views that Claude takes comes up in the conversation, and Claude sums up what it built.
4. 33–40 s: Ctrl+Z in the editor takes Claude's last change back, and Ctrl+Shift+Z brings it back.

**Then.**

- In the same session, a still of the Godot MCP panel at the bottom of the editor, cropped to the panel:
  `editor-panel.png`, with the connection, the two switches and the commands that Claude sent.
- The recording as an animated GIF or WebP, about 960 pixels wide and under 3 MB, since the npm page shows pictures
  but no video. GitHub shows the same file.
- A still from the recording, Claude Code beside the editor, cropped to 16:9, as the thumbnail of the Asset Store
  listing ([asset-store.md](../asset-store.md)).
