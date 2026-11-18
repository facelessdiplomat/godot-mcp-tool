# Pave the courtyard

**Request**

> In res://courtyard.tscn, pave the courtyard: put the Floor block of the GridMap's mesh library on every cell from (-4, 0, -4) to (3, 0, 3), and a Wall block on every cell of the ring around them.

**Starting point**

`res://courtyard.tscn`, the main scene: an empty `GridMap` named `Courtyard` whose mesh library,
`res://blocks.tres`, holds two items, `Floor` (0) and `Wall` (1), with a light and a camera.

**Done when**

- The saved scene has a `Floor` block on each of the 64 cells from (-4, 0, -4) to (3, 0, 3).
- It has a `Wall` block on each of the 36 cells of the ring around them, and no other cells.
- The running game has the same floor and walls.

**Notes**

- `gridmap_set_cells` paints it with two boxes, a box of walls and a box of floor inside it, and `gridmap_get_cells`
  counts the blocks. A script that fills the cells when the game starts passes the last check only, since the level is
  then missing from the scene that the editor shows.
- Evaluation run: `server/test/evals/scenarios/paveTheCourtyard.ts`.
