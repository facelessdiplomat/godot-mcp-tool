extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpGameInputCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_input_command.gd")
const GodotMcpGamePropertiesGetCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_properties_get_command.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpGameStepCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_step_command.gd")
const GodotMcpGameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const GodotMcpHeadlessWindow := preload("res://addons/godot_mcp_tool/runtime/headless_window.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

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


class RecordingMoments:
	extends "res://addons/godot_mcp_tool/capture/moment_camera.gd"

	var grabbed := 0
	var saved_labels := PackedStringArray()
	var saved_count := 0

	func _init() -> void:
		super(null)

	func grab() -> Variant:
		grabbed += 1
		return Image.create_empty(4, 4, false, Image.FORMAT_RGBA8)

	func save(images: Array, labels: PackedStringArray, _options: Dictionary) -> Variant:
		saved_count = images.size()
		saved_labels = labels
		return {"path": "/captures/moments-1-001.png", "moments": Array(labels)}


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
var _time: GodotMcpGameTime
var _command: GodotMcpGameInputCommand
var _moments: RecordingMoments
var _runner_window_size := Vector2i.ZERO


func before_all() -> void:
	_runner_window_size = get_tree().root.size
	GodotMcpHeadlessWindow.give_project_size(get_tree().root)


func after_all() -> void:
	get_tree().root.size = _runner_window_size


func before_each() -> void:
	InputMap.add_action(JUMP_ACTION)
	var key := InputEventKey.new()
	key.physical_keycode = KEY_J
	InputMap.action_add_event(JUMP_ACTION, key)
	var button := InputEventJoypadButton.new()
	button.button_index = JOY_BUTTON_A
	button.device = -1
	InputMap.action_add_event(JUMP_ACTION, button)
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
	_time = GodotMcpGameTime.new()
	add_child_autoqfree(_time)
	_command = _command_with(FixedCapture.new({}))


func after_each() -> void:
	get_tree().paused = false
	Input.action_release(JUMP_ACTION)
	InputMap.erase_action(JUMP_ACTION)


func _command_with(capture: FixedCapture) -> GodotMcpGameInputCommand:
	var codec := GodotMcpVariantCodec.new()
	var scene := GodotMcpGameScene.new(func() -> Node: return _arena)
	var reader := GodotMcpGamePropertiesGetCommand.new(scene, GodotMcpPropertyEditor.new(codec), codec)
	_moments = RecordingMoments.new()
	return GodotMcpGameInputCommand.new(capture, _time, reader, scene, _moments)


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
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Step 1")


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
	await GodotMcpGameStepCommand.new(_time).execute({"physics_frames": 1})
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


func test_presses_a_joypad_button_for_the_given_physics_frames() -> void:
	var pressed_frames := _watched("pressed_frames")
	var result: Dictionary = await _command.execute({"steps": [{"joypad_button": "a", "physics_frames": 3}]})
	assert_eq(_watched("pressed_frames") - pressed_frames, 3)
	assert_eq(result["physics_frames"], 3)
	assert_false(Input.is_joy_button_pressed(0, JOY_BUTTON_A))


func test_tilts_a_stick_and_centers_it_again() -> void:
	var tilted: Dictionary = await _command.execute({"steps": [{"joypad_motion": "left_x", "value": -0.5, "state": "down"}], "release_at_end": false})
	assert_eq(tilted["held"], ["joypad_motion left_x"])
	assert_almost_eq(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), -0.5, 0.0001)
	await _command.execute({"steps": [{"joypad_motion": "left_x", "state": "up"}]})
	assert_eq(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), 0.0)


func test_explains_a_stick_without_a_value() -> void:
	var error: Variant = await _command.execute({"steps": [{"joypad_motion": "left_x"}]})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Step 1")
	assert_string_contains((error as GodotMcpCommandError).message, "value")


func test_explains_an_unknown_joypad_button() -> void:
	var error: Variant = await _command.execute({"steps": [{"joypad_button": "z"}]})
	assert_string_contains((error as GodotMcpCommandError).message, "Unknown joypad button \"z\"")


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
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains((error as GodotMcpCommandError).message, "Step 2")
	assert_string_contains((error as GodotMcpCommandError).message, JUMP_ACTION)
	assert_eq(_recorder.events, [])


func test_explains_a_step_it_does_not_know() -> void:
	var error: Variant = await _command.execute({"steps": [{"fly": true}]})
	assert_string_contains((error as GodotMcpCommandError).message, "Step 1")
	assert_string_contains((error as GodotMcpCommandError).hint, "mouse_motion")


func test_requires_steps() -> void:
	assert_true(await _command.execute({"steps": []}) is GodotMcpCommandError)


func test_takes_a_screenshot_after_the_last_step() -> void:
	var capture := FixedCapture.new({"path": "/captures/game-1-001.png"})
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}], "screenshot": true})
	assert_eq(result["screenshot"], {"path": "/captures/game-1-001.png"})


func test_reports_a_screenshot_that_failed_after_the_input() -> void:
	var capture := FixedCapture.new(GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The game runs without a window (headless), so it cannot render a screenshot"))
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}], "screenshot": true})
	assert_eq(result["steps"], 1)
	assert_string_contains(result["screenshot_error"], "without a window")


func test_takes_no_screenshot_unless_asked() -> void:
	var capture := FixedCapture.new({"path": "/captures/game-1-001.png"})
	var result: Dictionary = await _command_with(capture).execute({"steps": [{"action": JUMP_ACTION}]})
	assert_eq(capture.calls, 0)
	assert_false(result.has("screenshot"))


func _add_button(path_name: String, position: Vector2, size: Vector2) -> Button:
	var menu := Control.new()
	menu.name = "Menu"
	_arena.add_child(menu)
	var button := Button.new()
	button.name = path_name
	button.position = position
	button.size = size
	menu.add_child(button)
	return button


func test_scrolls_the_mouse_wheel_where_asked() -> void:
	await _command.execute({"steps": [{"wheel": "down", "at": [20, 30], "clicks": 2}]})
	var wheel := _events_of("InputEventMouseButton").filter(func(event: InputEventMouseButton) -> bool: return event.button_index == MOUSE_BUTTON_WHEEL_DOWN)
	assert_eq(wheel.map(func(event: InputEventMouseButton) -> bool: return event.pressed), [true, false, true, false])
	assert_eq((wheel[0] as InputEventMouseButton).position, Vector2(20, 30))


func test_drags_with_a_mouse_button_held() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"click": [10, 10], "state": "down"}, {"mouse_motion": [30, 0]}, {"click": [40, 10], "state": "up"}]})
	var motions := _events_of("InputEventMouseMotion")
	assert_eq((motions[-2] as InputEventMouseMotion).button_mask, MOUSE_BUTTON_MASK_LEFT)
	var buttons := _events_of("InputEventMouseButton")
	assert_eq(buttons.map(func(event: InputEventMouseButton) -> bool: return event.pressed), [true, false])
	assert_eq((buttons[1] as InputEventMouseButton).position, Vector2(40, 10))
	assert_eq(result["released"], [])


func test_releases_a_held_mouse_button_at_the_end() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"click": [10, 10], "state": "down", "button": "right"}]})
	assert_eq(result["released"], ["mouse right"])
	var buttons := _events_of("InputEventMouseButton")
	assert_eq(buttons.map(func(event: InputEventMouseButton) -> bool: return event.pressed), [true, false])


func test_clicks_a_control_by_its_path() -> void:
	var button := _add_button("Resume", Vector2(100, 100), Vector2(80, 30))
	var result: Dictionary = await _command.execute({"steps": [{"click": "Menu/Resume"}]})
	var buttons := _events_of("InputEventMouseButton")
	assert_eq((buttons[0] as InputEventMouseButton).position, Vector2(140, 115))
	assert_eq(result["clicked"], [{"step": 1, "path": "Menu/Resume", "at": [140, 115]}])
	button.queue_free()


func test_stops_at_a_control_it_cannot_click() -> void:
	var button := _add_button("Resume", Vector2(100, 100), Vector2(80, 30))
	button.visible = false
	var result: Dictionary = await _command.execute({"steps": [{"click": "Menu/Resume"}, {"action": JUMP_ACTION}]})
	assert_eq(result["failed_step"]["step"], 1)
	assert_string_contains(result["failed_step"]["error"], "not visible")
	assert_eq(_events_of("InputEventAction"), [])


func test_refuses_to_click_a_node_that_is_not_a_control() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"click": "Watcher"}]})
	assert_string_contains(result["failed_step"]["error"], "not a Control")


func test_taps_and_drags_a_finger_on_the_touch_screen() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"touch": [50, 60], "state": "down", "finger": 1}, {"touch_drag": [20, 0], "finger": 1}, {"touch": [70, 60], "state": "up", "finger": 1}]})
	var touches := _events_of("InputEventScreenTouch")
	assert_eq(touches.map(func(event: InputEventScreenTouch) -> bool: return event.pressed), [true, false])
	assert_eq((touches[0] as InputEventScreenTouch).index, 1)
	var drags := _events_of("InputEventScreenDrag")
	assert_eq((drags[0] as InputEventScreenDrag).position, Vector2(70, 60))
	assert_eq((drags[0] as InputEventScreenDrag).relative, Vector2(20, 0))
	assert_eq(result["released"], [])


func test_stops_at_a_drag_of_a_finger_that_is_not_down() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"touch_drag": [20, 0]}]})
	assert_string_contains(result["failed_step"]["error"], "not down")


func test_takes_screenshots_at_moments_of_the_input_and_at_the_end() -> void:
	var result: Dictionary = await _command.execute({"steps": [{"screenshot": true}, {"wait_physics_frames": 3}, {"screenshot": true}], "screenshot": true})
	assert_eq(_moments.grabbed, 3)
	assert_eq(_moments.saved_labels, PackedStringArray(["step 1, frame 0", "step 3, frame 3", "end, frame 3"]))
	assert_eq(result["screenshot"]["path"], "/captures/moments-1-001.png")


func test_refuses_more_screenshots_than_one_image_holds() -> void:
	var steps: Array = []
	for index in 7:
		steps.append({"screenshot": true})
	var error: Variant = await _command.execute({"steps": steps})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "6")


func test_lists_the_signals_emitted_while_the_input_plays() -> void:
	_watcher.add_user_signal("bumped", [{"name": "strength", "type": TYPE_INT}])
	var emit_after_two_frames := func() -> void:
		await _time.physics_frame_ended
		await _time.physics_frame_ended
		_watcher.emit_signal(&"bumped", 7)
	emit_after_two_frames.call()
	var result: Dictionary = await _command.execute({"steps": [{"wait_physics_frames": 4}], "watch_signals": [{"node": "Watcher", "signal": "bumped"}]})
	var watched: Array = result["signals"]
	assert_eq(watched.size(), 1)
	assert_eq(watched[0]["node"], "Watcher")
	assert_eq(watched[0]["signal"], "bumped")
	var emissions: Array = watched[0]["emissions"]
	assert_eq(emissions.size(), 1)
	assert_eq(emissions[0]["step"], 1)
	assert_eq(emissions[0]["arguments"], [7])


func test_refuses_to_watch_a_signal_that_the_node_lacks() -> void:
	var error: Variant = await _command.execute({"steps": [{"wait_physics_frames": 1}], "watch_signals": [{"node": "Watcher", "signal": "bumpd"}]})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "bumpd")
	assert_eq(_recorder.events, [])


func test_presses_a_button_by_its_path_in_a_paused_game() -> void:
	var layer := CanvasLayer.new()
	layer.name = "PauseMenu"
	layer.process_mode = Node.PROCESS_MODE_ALWAYS
	_arena.add_child(layer)
	var button := Button.new()
	button.name = "Resume"
	button.text = "Resume"
	button.position = Vector2(500, 280)
	button.size = Vector2(70, 31)
	layer.add_child(button)
	var presses: Array = []
	button.pressed.connect(func() -> void: presses.append(true))
	get_tree().paused = true
	await _command.execute({"steps": [{"click": "PauseMenu/Resume"}]})
	get_tree().paused = false
	assert_eq(presses.size(), 1)


func test_presses_a_button_by_its_path() -> void:
	var button := Button.new()
	button.name = "Plain"
	button.text = "Plain"
	button.position = Vector2(300, 200)
	button.size = Vector2(70, 31)
	_arena.add_child(button)
	var presses: Array = []
	button.pressed.connect(func() -> void: presses.append(true))
	await _command.execute({"steps": [{"click": "Plain"}]})
	assert_eq(presses.size(), 1)
