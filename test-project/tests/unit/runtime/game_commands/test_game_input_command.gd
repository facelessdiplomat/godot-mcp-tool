extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GameInputCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_input_command.gd")
const GamePropertiesGetCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_properties_get_command.gd")
const GameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GameStepCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_step_command.gd")
const GameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const JUMP_ACTION := "mcp_test_jump"
const WATCHER := """extends Node

var ticks := 0
var pressed_frames := 0
var just_pressed_frames := 0


func _physics_process(_delta: float) -> void:
	ticks += 1
	if Input.is_action_pressed("mcp_test_jump"):
		pressed_frames += 1
	if Input.is_action_just_pressed("mcp_test_jump"):
		just_pressed_frames += 1
"""


class InputRecorder:
	extends Node

	var events: Array = []

	func _input(event: InputEvent) -> void:
		events.append(event)


class FixedCapture:
	extends "res://addons/godot_mcp_tool/commands/command.gd"

	var outcome: Variant
	var calls := 0

	func _init(fixed_outcome: Variant) -> void:
		outcome = fixed_outcome

	func execute(_params: Dictionary) -> Variant:
		calls += 1
		return outcome


var _recorder: InputRecorder
var _arena: Node
var _watcher: Node
var _time: GameTime
var _command: GameInputCommand


func before_each() -> void:
	InputMap.add_action(JUMP_ACTION)
	var key := InputEventKey.new()
	key.physical_keycode = KEY_J
	InputMap.action_add_event(JUMP_ACTION, key)
	_recorder = InputRecorder.new()
	add_child_autofree(_recorder)
	_arena = Node.new()
	_arena.name = "Arena"
	_watcher = Node.new()
	_watcher.name = "Watcher"
	var script := GDScript.new()
	script.source_code = WATCHER
	script.reload()
	_watcher.set_script(script)
	_watcher.process_mode = Node.PROCESS_MODE_PAUSABLE
	_arena.add_child(_watcher)
	add_child_autofree(_arena)
	_time = GameTime.new()
	add_child_autoqfree(_time)
	_command = _command_with(FixedCapture.new({}))


func after_each() -> void:
	get_tree().paused = false
	Input.action_release(JUMP_ACTION)
	InputMap.erase_action(JUMP_ACTION)


func _command_with(capture: FixedCapture) -> GameInputCommand:
	var codec := VariantCodec.new()
	var reader := GamePropertiesGetCommand.new(GameScene.new(func() -> Node: return _arena), PropertyEditor.new(codec), codec)
	return GameInputCommand.new(capture, _time, reader)


func _watched(property: String) -> int:
	return _watcher.get(property)


func _events_of(event_class: String) -> Array:
	return _recorder.events.filter(func(event: InputEvent) -> bool: return event.is_class(event_class))


func test_taps_an_action_with_input_events() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION}]})
	assert_eq(result["steps"], 1)
	assert_eq(_events_of("InputEventAction").map(func(event: InputEventAction) -> bool: return event.pressed), [true, false])
	assert_false(Input.is_action_pressed(JUMP_ACTION))


func test_holds_an_action_for_exactly_the_given_physics_frames() -> void:
	var pressed_frames := _watched("pressed_frames")
	var result: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "physics_frames": 5}]})
	assert_eq(_watched("pressed_frames") - pressed_frames, 5)
	assert_eq(result["physics_frames"], 5)
	assert_false(Input.is_action_pressed(JUMP_ACTION))


func test_counts_a_tap_as_one_press() -> void:
	var just_pressed_frames := _watched("just_pressed_frames")
	await _command.execute({"steps": [{"action": JUMP_ACTION}]})
	assert_eq(_watched("just_pressed_frames") - just_pressed_frames, 1)


func test_reads_a_node_at_moments_of_the_input() -> void:
	var result: Dictionary = await _command.execute({
		"steps": [{"read": "Watcher", "names": ["ticks"]}, {"wait_physics_frames": 3}, {"read": "Watcher", "names": ["ticks"]}],
	})
	var reads: Array = result["reads"]
	assert_eq(reads.map(func(read: Dictionary) -> int: return read["step"]), [1, 3])
	assert_eq(reads.map(func(read: Dictionary) -> int: return read["physics_frames"]), [0, 3])
	assert_eq(reads[1]["path"], "Watcher")
	var first_ticks: int = (reads[0]["properties"] as Array)[0]["value"]
	assert_eq((reads[1]["properties"] as Array)[0]["value"], first_ticks + 3)


func test_reports_a_node_it_cannot_read_and_plays_the_rest() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"read": "Nobody", "names": ["ticks"]}, {"wait_physics_frames": 1}]})
	assert_eq(result["steps"], 2)
	assert_eq(result["physics_frames"], 1)
	assert_string_contains((result["reads"] as Array)[0]["error"], "Nobody")


func test_refuses_a_read_without_names() -> void:
	var error: Variant = await _command.execute({"steps": [{"read": "Watcher"}]})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "Step 1")


func test_plays_input_into_a_held_game_only_while_it_waits() -> void:
	_time.hold()
	var ticks := _watched("ticks")
	var pressed_frames := _watched("pressed_frames")
	var result: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "physics_frames": 2}, {"wait_physics_frames": 3}]})
	assert_eq(_watched("ticks") - ticks, 5)
	assert_eq(_watched("pressed_frames") - pressed_frames, 2)
	assert_eq(result["physics_frames"], 5)
	assert_true(result["paused"])
	for frame in 3:
		await get_tree().physics_frame
	assert_eq(_watched("ticks") - ticks, 5)


func test_keeps_input_for_a_held_game_until_it_advances() -> void:
	_time.hold()
	var just_pressed_frames := _watched("just_pressed_frames")
	var result: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "state": "down"}], "release_at_end": false})
	assert_eq(result["physics_frames"], 0)
	assert_false(Input.is_action_pressed(JUMP_ACTION))
	await GameStepCommand.new(_time).execute({"physics_frames": 1})
	assert_true(Input.is_action_pressed(JUMP_ACTION))
	assert_eq(_watched("just_pressed_frames") - just_pressed_frames, 1)


func test_releases_held_input_at_the_end() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "state": "down"}, {"wait_physics_frames": 2}]})
	assert_eq(result["released"], [JUMP_ACTION])
	assert_false(Input.is_action_pressed(JUMP_ACTION))


func test_can_keep_input_held_for_later() -> void:
	var held: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "state": "down"}], "release_at_end": false})
	assert_eq(held["held"], [JUMP_ACTION])
	assert_true(Input.is_action_pressed(JUMP_ACTION))
	var released: Dictionary = await _command.execute({"steps": [{"action": JUMP_ACTION, "state": "up"}]})
	assert_eq(released["held"], [])
	assert_false(Input.is_action_pressed(JUMP_ACTION))


func test_presses_keys_that_trigger_actions() -> void:
	var observed: Array = []
	var watch := func() -> void: observed.append(Input.is_action_pressed(JUMP_ACTION))
	get_tree().physics_frame.connect(watch)
	await _command.execute({"steps": [{"key": "J", "physics_frames": 3}]})
	get_tree().physics_frame.disconnect(watch)
	var keys := _events_of("InputEventKey")
	assert_eq(keys.map(func(event: InputEventKey) -> bool: return event.pressed), [true, false])
	assert_eq((keys[0] as InputEventKey).physical_keycode, KEY_J)
	assert_true(observed.has(true))


func test_moves_the_mouse_and_clicks_in_viewport_coordinates() -> void:
	await _command.execute({"steps": [{"mouse_motion": [10, -5]}, {"click": [100, 50]}]})
	var motions := _events_of("InputEventMouseMotion")
	assert_eq((motions[0] as InputEventMouseMotion).relative, Vector2(10, -5))
	var buttons := _events_of("InputEventMouseButton")
	assert_eq(buttons.map(func(event: InputEventMouseButton) -> bool: return event.pressed), [true, false])
	assert_eq((buttons[0] as InputEventMouseButton).position, Vector2(100, 50))
	assert_eq((buttons[0] as InputEventMouseButton).button_index, MOUSE_BUTTON_LEFT)


func test_types_text() -> void:
	await _command.execute({"steps": [{"text": "Hi"}]})
	var typed := _events_of("InputEventKey").filter(func(event: InputEventKey) -> bool: return event.pressed)
	assert_eq(typed.map(func(event: InputEventKey) -> String: return char(event.unicode)), ["H", "i"])


func test_waits_between_steps() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"wait_ms": 40}]})
	assert_gte(result["waited_ms"], 35)


func test_checks_every_step_before_sending_anything() -> void:
	var error: Variant = await _command.execute({"steps": [{"action": JUMP_ACTION}, {"action": "mcp_test_jmp"}]})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
	assert_string_contains((error as CommandError).message, "Step 2")
	assert_string_contains((error as CommandError).message, JUMP_ACTION)
	assert_eq(_recorder.events, [])


func test_explains_a_step_it_does_not_know() -> void:
	var error: Variant = await _command.execute({"steps": [{"fly": true}]})
	assert_string_contains((error as CommandError).message, "Step 1")
	assert_string_contains((error as CommandError).hint, "mouse_motion")


func test_requires_steps() -> void:
	assert_true(await _command.execute({"steps": []}) is CommandError)


func test_takes_a_screenshot_after_the_last_step() -> void:
	var capture := FixedCapture.new({"path": "/captures/game-1-001.png"})
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}], "screenshot": true})
	assert_eq(result["screenshot"], {"path": "/captures/game-1-001.png"})


func test_reports_a_screenshot_that_failed_after_the_input() -> void:
	var capture := FixedCapture.new(CommandError.new(JsonRpc.OPERATION_FAILED, "The game runs without a window (headless), so it cannot render a screenshot"))
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}], "screenshot": true})
	assert_eq(result["steps"], 1)
	assert_string_contains(result["screenshot_error"], "without a window")


func test_takes_no_screenshot_unless_asked() -> void:
	var capture := FixedCapture.new({"path": "/captures/game-1-001.png"})
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}]})
	assert_eq(capture.calls, 0)
	assert_false(result.has("screenshot"))
