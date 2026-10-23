# Find a bug with breakpoints

**Request**

> After the first hit, the enemy never takes damage again. Find out why with the debugger and fix it.

**Starting point**

A Godot project with the addon enabled and the editor running, and a level with an enemy whose script
`res://enemy.gd` makes it invulnerable for half a second after a hit, but sets the flag back to `true` instead of
`false` when the timer runs out:

```gdscript
extends CharacterBody3D

var health := 3
var invulnerable := false


func take_damage(amount: int) -> void:
	if invulnerable:
		return
	health -= amount
	invulnerable = true
	get_tree().create_timer(0.5).timeout.connect(_on_invulnerability_timeout)


func _on_invulnerability_timeout() -> void:
	invulnerable = true
```

The level hits the enemy once a second.

**Done when**

- The agent stopped the game in `take_damage` with `debug_breakpoints` and `game_run`, and `debug_state` showed
  `invulnerable = true` at the second hit, long after the half second.
- `_on_invulnerability_timeout` sets `invulnerable = false`, and in the running game `health` drops to 1 after two
  hits (`game_wait` and `game_get_properties`).
- No breakpoints are left (`debug_breakpoints` lists none), and the game is not stopped in the debugger.

**Notes**

- A good run reads the variables at the breakpoint instead of adding `print` calls, steps with `debug_continue`
  when it needs the next line, and removes its breakpoints at the end.
- It does not leave the game stopped in the debugger while it uses `game_wait` or `game_input`, which refuse then.
- Automated test: `server/test/integration/debugging.test.ts`.
- Evaluation run: `server/test/evals/scenarios/findABugWithBreakpoints.ts`.
