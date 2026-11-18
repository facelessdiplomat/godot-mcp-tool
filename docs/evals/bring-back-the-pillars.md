# Bring back the pillars

**Request**

> Earlier you deleted the pillars of the arena by mistake. Bring them back exactly as they were, but leave the camera where it is now.

**Starting point**

The arena had `Pillars`, a `Node3D` with four `CSGBox3D` pillars at its corners, each turned by a different angle
(15°, 30°, 45° and 60°) and 1.1 × 3.2 × 1.1 m in size. In the same editor session the tools deleted `Pillars`
(`MCP: Delete Pillars`), then moved `Camera` to `(0, 10, 16)` (`MCP: Set properties of Camera`), and the scene was
saved, so the file no longer has the pillars; only the Undo history of the editor does.

**Done when**

- The four pillars are back under `Pillars` with the position, turn and size they had.
- The saved `arena.tscn` has the pillars, and `Camera` at `(0, 10, 16)`.
- The agent took the deletion back with `editor_undo`.

**Notes**

- The deletion is not the last action: undoing it also undoes the move of the camera, so a good run reads where the
  camera is first, undoes both actions (`count: 2`, or one at a time while reading "Next to undo"), moves the camera
  back and saves.
- Rebuilding the pillars by hand cannot get the turns and sizes right, since nothing on disk has them any more.
- Automated test: `server/test/integration/sceneEditing.test.ts` ("takes back its own changes with editor_undo…").
- Evaluation run: `server/test/evals/scenarios/bringBackThePillars.ts`.
