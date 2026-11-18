# Fix the water shader

**Request**

> The water in the arena pool stopped moving after I edited its shader, and Godot prints shader errors. Fix the shader so that the waves move again.

**Starting point**

The arena with `Pool`, a subdivided `PlaneMesh` whose `ShaderMaterial` uses `res://water.gdshader`. The shader moves
the vertices with two waves of `TIME` and has the uniforms `wave_height`, `wave_length` and `water_color`. The
user's last edit left two errors in it: a missing semicolon after the second wave and `ALBEDO = vec4(...)`, which
needs a `vec3`. Godot's shader compiler stops at the first error of a shader, so the second one shows only after the
first is fixed.

**Done when**

- `script_validate` compiles `res://water.gdshader` without problems.
- The shader keeps the three uniforms of its material, and its `vertex()` still moves `VERTEX.y` with `TIME`.
- The game runs without errors.
- The agent compiled the shader with `script_validate`.

**Notes**

- A good run reads the error and its line from `script_validate`, fixes it, checks again and finds the second error;
  it does not stop after the first fix or remove the waves to make the errors go away.
- The plugin's hook checks a `.gdshader` after every edit too, so an agent that edits with its file tools sees the next
  error right away.
- Automated test of the shader check: `server/test/integration/scriptValidation.test.ts`.
- Evaluation run: `server/test/evals/scenarios/fixTheWaterShader.ts`.
