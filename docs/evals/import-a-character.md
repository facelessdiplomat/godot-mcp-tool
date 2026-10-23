# Import a character

**Request**

> Import the character model `res://models/character.glb`: scale it to 1.8 m and give it a capsule collision.

**Starting point**

A Godot project with the addon enabled and the editor running. `res://models/character.glb` is the fixture
`test-project/tests/fixtures/models/character.glb`: a capsule-shaped character 180 units tall and 50 wide, exported
in centimeters, with one mesh node `Body` and the material `Skin`.

**Done when**

- `res://models/character.glb.import` has `nodes/root_scale=0.01` (or another setting that makes the model 1.8 m tall).
- `asset_import_settings_get` reports the imported scene as 0.5 × 1.8 × 0.5 m.
- One capsule fits the mesh: about 0.25 m in radius and 1.8 m tall, with its center at the center of the mesh, all
  within 0.1 m. It is either the only collision shape of the imported scene, or the only fitting `CapsuleShape3D` of
  a scene that instances the model.
- A scene that instances the model measures 1.8 m tall with `node_get_bounds`.

**Notes**

- A good run reads the settings first (`asset_import_settings_get`), sees 180 units, and fixes the scale in the import
  settings rather than by scaling a node.
- Generated capsules are not fitted to the mesh: the run gives `primitive/radius` and `primitive/height` in the
  model's units (25 and 180) and checks the collision shapes in the result.
- For a character that moves, collision generated on import gives a `StaticBody3D`; the run may instead, or as well,
  build a `CharacterBody3D` scene around the model with a `CapsuleShape3D` sized with `node_get_bounds`. Either passes
  if the capsule matches the mesh; the evaluation run has a reference solution for each.
- Evaluation run: `server/test/evals/scenarios/importACharacter.ts`.
