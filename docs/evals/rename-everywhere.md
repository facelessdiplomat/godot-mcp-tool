# Rename everywhere

**Request**

> Rename take_damage to apply_damage everywhere, so that nothing calls the old name any more.

**Starting point**

The arena with `Goblin`, a node with `res://enemy.gd` (`class_name Enemy`) that declares `take_damage`, a trap whose
script calls `target.take_damage(3)`, a signal connection from the trap to `Goblin.take_damage`, and an
`AnimationPlayer` whose `hurt` animation calls `take_damage` on `Goblin` from a method track.

**Done when**

- No script or scene names `take_damage` any more, and `enemy.gd` declares `apply_damage`.
- The signal connection and the method track of `arena.tscn` call `apply_damage`.
- The scripts have no errors and the game runs without errors.
- The agent renamed with `script_rename_symbol`.

**Notes**

- `script_rename_symbol` renames the uses that the language server can trace in the scripts, and the signal
  connections and method track keys in scenes; a rename by hand easily misses the scene.
- Evaluation run: `server/test/evals/scenarios/renameEverywhere.ts`.
