# Export the game

**Request**

> Make a build of the game for this Mac that I can send to a friend.

**Starting point**

A Godot project with the addon enabled and the editor running, a main scene, an export preset named `macOS` with the
export path `build/macos/game.zip`, and an unsaved change in the main scene. Two variants: export templates for the
Godot version installed, or not (a custom build of Godot has none).

**Done when**

- Whatever was exported, a build or a `.pck`, has the change in the main scene: it was saved before the export.
- With the templates: `build/macos/game.zip` exists, `export_project` listed it with its size, and `build/` has a
  `.gdignore` file.
- Without the templates: the agent said that it could not make the build, told the user which template file is
  missing and how to get it (for a custom build, how to build it from the same source), and offered a data-only
  export (`mode: "pack"`).

**Notes**

- A good run saves with `scene_save` before exporting, or exports again after the result names the unsaved scene.
- It does not edit `export_presets.cfg` or point the export outside the project; it does not report a failed export as
  a build.
- Automated test: `server/test/integration/exportProject.test.ts`.
- Evaluation run: `server/test/evals/scenarios/exportTheGame.ts`.
