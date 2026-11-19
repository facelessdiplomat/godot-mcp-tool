extends GutTest

const GodotMcpInputRecording := preload("res://addons/godot_mcp_tool/input/input_recording.gd")

const HALF_SIZE_VIEW := Transform2D(0.0, Vector2(0.5, 0.5), 0.0, Vector2.ZERO)


func _action_of(event: InputEvent) -> String:
	if event is InputEventKey and (event as InputEventKey).physical_keycode == KEY_W:
		return "move_forward"
	if event is InputEventKey and (event as InputEventKey).physical_keycode == KEY_SPACE:
		return "jump"
	if event is InputEventJoypadButton and (event as InputEventJoypadButton).button_index == JOY_BUTTON_A:
		return "jump"
	return ""


func _key(code: Key, pressed: bool, echo := false) -> InputEventKey:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.pressed = pressed
	event.echo = echo
	return event


func _record(event: InputEvent, frame: int) -> Variant:
	return GodotMcpInputRecording.record_of(event, frame, Transform2D.IDENTITY, _action_of)


func _press(target: Dictionary, frame: int) -> Dictionary:
	return {"frame": frame, "kind": "button", "target": target, "pressed": true}


func _release(target: Dictionary, frame: int) -> Dictionary:
	return {"frame": frame, "kind": "button", "target": target, "pressed": false}


func test_records_a_key_of_an_action_as_the_action() -> void:
	assert_eq(_record(_key(KEY_W, true), 12), _press({"action": "move_forward"}, 12))


func test_records_a_key_without_an_action_by_its_name_and_modifiers() -> void:
	var event := _key(KEY_F5, true)
	event.ctrl_pressed = true
	assert_eq(_record(event, 3), _press({"key": "F5", "ctrl": true}, 3))


func test_leaves_out_repeats_and_modifier_keys_alone() -> void:
	assert_null(_record(_key(KEY_W, true, true), 4))
	assert_null(_record(_key(KEY_SHIFT, true), 4))


func test_records_a_gamepad_button_of_an_action_as_the_action_and_others_by_name() -> void:
	var a := InputEventJoypadButton.new()
	a.button_index = JOY_BUTTON_A
	a.pressed = true
	var start := InputEventJoypadButton.new()
	start.button_index = JOY_BUTTON_START
	start.pressed = true
	assert_eq(_record(a, 1), _press({"action": "jump"}, 1))
	assert_eq(_record(start, 1), _press({"joypad_button": "start"}, 1))


func test_records_mouse_input_in_pixels_of_the_game_view() -> void:
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_RIGHT
	click.pressed = true
	click.position = Vector2(400, 300)
	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_DOWN
	wheel.pressed = true
	wheel.position = Vector2(100, 50)
	var motion := InputEventMouseMotion.new()
	motion.relative = Vector2(20, -10)
	assert_eq(GodotMcpInputRecording.record_of(click, 7, HALF_SIZE_VIEW, _action_of), {"frame": 7, "kind": "mouse_button", "button": "right", "pressed": true, "double": false, "position": [200, 150]})
	assert_eq(GodotMcpInputRecording.record_of(wheel, 7, HALF_SIZE_VIEW, _action_of), {"frame": 7, "kind": "wheel", "direction": "down", "position": [50, 25]})
	assert_eq(GodotMcpInputRecording.record_of(motion, 7, HALF_SIZE_VIEW, _action_of), {"frame": 7, "kind": "mouse_motion", "relative": Vector2(10, -5)})


func test_turns_a_press_and_its_release_into_one_hold() -> void:
	var steps := GodotMcpInputRecording.steps_of([_press({"action": "jump"}, 10), _release({"action": "jump"}, 14)], 0, 30)
	assert_eq(steps, [{"wait_physics_frames": 10}, {"action": "jump", "physics_frames": 4}])


func test_keeps_overlapping_holds_apart_with_down_and_up() -> void:
	var forward := {"action": "move_forward"}
	var jump := {"action": "jump"}
	var steps := GodotMcpInputRecording.steps_of([_press(forward, 0), _press(jump, 5), _release(jump, 7), _release(forward, 20)], 0, 30)
	assert_eq(steps, [
		{"action": "move_forward", "state": "down"},
		{"wait_physics_frames": 5},
		{"action": "jump", "physics_frames": 2},
		{"wait_physics_frames": 13},
		{"action": "move_forward", "state": "up"},
	])


func test_holds_what_is_still_held_until_the_recording_stops() -> void:
	var steps := GodotMcpInputRecording.steps_of([_press({"key": "F5"}, 5)], 0, 50)
	assert_eq(steps, [{"wait_physics_frames": 5}, {"key": "F5", "state": "down"}, {"wait_physics_frames": 45}])


func test_splits_a_pause_longer_than_one_step_allows() -> void:
	var steps := GodotMcpInputRecording.steps_of([_press({"action": "jump"}, 5000), _release({"action": "jump"}, 5002)], 0, 6000)
	assert_eq(steps, [{"wait_physics_frames": 3600}, {"wait_physics_frames": 1400}, {"action": "jump", "physics_frames": 2}])


func test_turns_a_click_into_a_click_step_at_its_position() -> void:
	var press := {"frame": 3, "kind": "mouse_button", "button": "left", "pressed": true, "double": false, "position": [200, 150]}
	var release := {"frame": 6, "kind": "mouse_button", "button": "left", "pressed": false, "double": false, "position": [200, 150]}
	var right := {"frame": 9, "kind": "mouse_button", "button": "right", "pressed": true, "double": false, "position": [10, 20]}
	var right_up := {"frame": 10, "kind": "mouse_button", "button": "right", "pressed": false, "double": false, "position": [10, 20]}
	assert_eq(GodotMcpInputRecording.steps_of([press, release, right, right_up], 0, 20), [
		{"wait_physics_frames": 3},
		{"click": [200, 150]},
		{"wait_physics_frames": 9 - 3 - GodotMcpInputRecording.CLICK_PHYSICS_FRAMES},
		{"click": [10, 20], "button": "right"},
	])


func test_sums_mouse_motion_over_short_spans() -> void:
	var records: Array = []
	for frame in range(10, 22):
		records.append({"frame": frame, "kind": "mouse_motion", "relative": Vector2(2, -1)})
	assert_eq(GodotMcpInputRecording.steps_of(records, 10, 30), [
		{"mouse_motion": [12.0, -6.0]},
		{"wait_physics_frames": GodotMcpInputRecording.MOTION_SPAN_FRAMES},
		{"mouse_motion": [12.0, -6.0]},
	])


func test_reduces_a_stick_to_the_values_that_matter() -> void:
	var values := [0.05, 0.3, 0.32, 0.61, 0.58, 0.1]
	var records: Array = []
	for index in values.size():
		records.append({"frame": index * 10, "kind": "joypad_motion", "axis": "left_x", "value": values[index]})
	assert_eq(GodotMcpInputRecording.steps_of(records, 0, 60), [
		{"wait_physics_frames": 10},
		{"joypad_motion": "left_x", "value": 0.3, "state": "down"},
		{"wait_physics_frames": 20},
		{"joypad_motion": "left_x", "value": 0.6, "state": "down"},
		{"wait_physics_frames": 20},
		{"joypad_motion": "left_x", "state": "up"},
	])


func test_counts_the_turns_of_the_wheel() -> void:
	var records: Array = []
	for frame in [4, 5, 6]:
		records.append({"frame": frame, "kind": "wheel", "direction": "up", "position": [100, 80]})
	assert_eq(GodotMcpInputRecording.steps_of(records, 4, 10), [{"wheel": "up", "at": [100, 80], "clicks": 3}])
