# Testing with GUT and test_run

`test_run` runs the GUT (or gdUnit4) tests of the project in a separate Godot process and reports each failure with
its file, line and message, plus test scripts that failed to load. Tests read scenes and resources from disk, so save
with `scene_save` first.

## A GUT test script

- It lives in `res://test` (or `res://tests`), its file name starts with `test_`, it extends `GutTest`, and every
  test function starts with `test_`.

```gdscript
extends GutTest

const PLAYER_SCENE := preload("res://player/player.tscn")

var _player: Player


func before_each() -> void:
	_player = PLAYER_SCENE.instantiate() as Player
	add_child_autofree(_player)


func test_dash_speeds_the_player_up() -> void:
	_player.dash()
	assert_gt(_horizontal_speed(), Player.SPEED)


func test_dash_ends_after_a_while() -> void:
	_player.dash()
	await wait_physics_frames(30)
	assert_lte(_horizontal_speed(), Player.SPEED)


func _horizontal_speed() -> float:
	return Vector2(_player.velocity.x, _player.velocity.z).length()
```

- The scene's script declares `class_name Player`, so the test types `_player` as `Player`: `:=` then infers the
  types of its members, and a wrong name in `Player.SPEED` fails the check. A misspelled method or property on
  `_player` still compiles and fails only when the test runs.
- Test logic through methods such as `dash()`; for input, `Input.action_press("dash")` and
  `Input.action_release("dash")` work in tests too.
- `add_child_autofree(node)` puts a node into the tree (so `_ready` and physics run) and frees it after the test;
  `autofree(object)` frees an object that stays out of the tree. Leaked nodes show up as orphans in the output.
- Waiting: `await wait_physics_frames(10)`, `await wait_process_frames(5)`, `await wait_seconds(0.5)`,
  `await wait_until(func() -> bool: return _player.is_on_floor(), 2.0)`.
- Asserts: `assert_eq`, `assert_ne`, `assert_true`, `assert_false`, `assert_null`, `assert_gt`, `assert_gte`,
  `assert_lt`, `assert_lte`, `assert_almost_eq(got, expected, error_interval)` (floats and vectors), `assert_has`.
  For signals, call
  `watch_signals(object)` first, then `assert_signal_emitted(object, "died")`.
- `before_each`, `after_each`, `before_all` and `after_all` prepare and clean up.

## Running tests

- `test_run` runs `res://test` and `res://tests`, or what `.gutconfig.json` names.
- `test_run` with `paths: ["res://test/test_player.gd"]` runs one script, and with `name: "dash"` only the tests whose
  names contain "dash".
- A test that is missing from the report usually sits in a script that failed to load; `test_run` lists those with
  the line of the error.
- New `class_name` classes are known in tests once the editor has rescanned the project or Godot has imported it;
  `test_run` takes care of both.

## gdUnit4

- Test suites extend `GdUnitTestSuite`, test functions start with `test_`, and asserts are fluent:
  `assert_int(health).is_equal(3)`, `assert_vector(position).is_equal_approx(target, Vector3(0.01, 0.01, 0.01))`.
- Free test nodes with `auto_free(node)`. `test_run` runs whole suites; gdUnit4 cannot pick single tests by name.
