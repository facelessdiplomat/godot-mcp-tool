# A level of tiles

**Request**

> Make a 2D level in res://level.tscn and make it the main scene: a TileMapLayer with ground tiles from res://tiles.png, at least 20 tiles wide, that the player from res://player.tscn stands on, and a Camera2D that follows the player.

**Starting point**

A project with no main scene, `res://tiles.png` (two 32×32 tiles side by side, grass and dirt), and
`res://player.tscn`: a `CharacterBody2D` with a 24×40 rectangle shape, a colored rectangle and a script that falls
and walks with `move_left` and `move_right` (A and D). The editor has a window.

**Done when**

- `res://level.tscn` is the main scene.
- The saved level has at least 20 tiles, and so does the running level.
- In the running game the player lands on the tiles.
- Walking right for 3 seconds moves the player at least 300 pixels and the center of the camera at least 150 pixels,
  so a camera that stops at the edges of the level still counts once the player leaves the edge.

**Notes**

- This is the first 2D scenario. `tileset_add_atlas` builds the `TileSet` from the texture with a collision square on
  each tile, and `tilemap_set_cells` paints a row of ground; `tilemap_get_cells` shows the tiles, the collision and
  the cells.
- A script that paints the tiles when the game starts passes every check but the saved one.
- Evaluation run: `server/test/evals/scenarios/aLevelOfTiles.ts`.
