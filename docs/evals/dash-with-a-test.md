# Dash with a test

**Request**

> Add a dash action (Shift and gamepad B), create a PhysicsMaterial for ice and lay an icy patch with it in the arena, write a GUT test for Player.dash() and run it.

**Starting point**

The arena with a walking player (`class_name Player`) and GUT installed in `addons/gut`; tests live in `res://test/`.

**Done when**

- The `dash` action has Shift and the B button of a gamepad.
- A `PhysicsMaterial` with a low friction is saved as a `.tres` file and an icy patch in the arena uses it.
- A GUT test for `Player.dash()` runs with `test_run` and passes; the scripts have no errors.
- In the running game Shift dashes the player forward fast.

**Notes**

- A good run writes the test first and runs it red, then adds `dash()`.
- Automated test of the same flow: `server/test/integration/milestone3Scenario.test.ts`; evaluation run:
  `server/test/evals/scenarios/dashWithATest.ts`.
