# Exports for Windows and Linux

**Request**

> Set up exports of the game for Windows and Linux, with the builds going into the builds folder of the project.

**Starting point**

The arena as the main scene, the editor running, and no `export_presets.cfg`.

**Done when**

- `export_presets.cfg` has a preset for the platform `Windows Desktop` and one for `Linux`, each with its export path
  in `builds/` of the project.
- `export_project` with each preset and `mode: "pack"` exports the game data, which needs no export templates.
- The agent added the presets with `export_preset_add`.

**Notes**

- `export_preset_add` writes the presets with the default options of each platform; a preset written by hand easily
  misses options that the export needs.
- The request does not ask for builds. A good run may still say that a build needs the export templates of this Godot
  version, and that the Export dialog of the running editor shows the new presets after a restart.
- Automated test: `server/test/integration/exportProject.test.ts` ("exporting with a preset that export_preset_add
  wrote").
- Evaluation run: `server/test/evals/scenarios/exportsForWindowsAndLinux.ts`.
