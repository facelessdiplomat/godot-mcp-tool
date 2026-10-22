extends GutTest

const InputEventCodec := preload("res://addons/godot_mcp_tool/input/input_event_codec.gd")


func test_reads_a_key_name_as_a_physical_key() -> void:
	var event := InputEventCodec.decode("Space") as InputEventKey
	assert_eq(event.physical_keycode, KEY_SPACE)
	assert_eq(event.keycode, KEY_NONE)


func test_reads_a_key_with_modifiers() -> void:
	var event := InputEventCodec.decode({"type": "key", "key": "S", "ctrl": true, "shift": true}) as InputEventKey
	assert_eq(event.physical_keycode, KEY_S)
	assert_true(event.ctrl_pressed)
	assert_true(event.shift_pressed)
	assert_false(event.alt_pressed)


func test_reads_mouse_buttons_by_name_or_number() -> void:
	assert_eq((InputEventCodec.decode({"type": "mouse_button", "button": "right"}) as InputEventMouseButton).button_index, MOUSE_BUTTON_RIGHT)
	assert_eq((InputEventCodec.decode({"type": "mouse_button", "button": 4}) as InputEventMouseButton).button_index, MOUSE_BUTTON_WHEEL_UP)


func test_reads_joypad_buttons_and_axes() -> void:
	assert_eq((InputEventCodec.decode({"type": "joypad_button", "button": "a"}) as InputEventJoypadButton).button_index, JOY_BUTTON_A)
	var motion := InputEventCodec.decode({"type": "joypad_motion", "axis": "left_y", "direction": -1}) as InputEventJoypadMotion
	assert_eq(motion.axis, JOY_AXIS_LEFT_Y)
	assert_eq(motion.axis_value, -1.0)


func test_explains_an_unknown_key() -> void:
	var outcome: Variant = InputEventCodec.decode("Spce")
	assert_true(outcome is String)
	assert_string_contains(outcome, "Spce")
	assert_string_contains(outcome, "Space")


func test_explains_an_unknown_event_type() -> void:
	assert_string_contains(InputEventCodec.decode({"type": "touch"}), "key, mouse_button, joypad_button or joypad_motion")


func test_explains_a_joypad_axis_without_a_direction() -> void:
	assert_string_contains(InputEventCodec.decode({"type": "joypad_motion", "axis": "left_x"}), "direction")


func test_describes_events_in_the_same_format_with_a_short_text() -> void:
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W
	key.shift_pressed = true
	assert_eq(InputEventCodec.describe(key), {"type": "key", "key": "W", "shift": true, "text": "Shift+W"})
	var mouse_button := InputEventMouseButton.new()
	mouse_button.button_index = MOUSE_BUTTON_RIGHT
	assert_eq(InputEventCodec.describe(mouse_button), {"type": "mouse_button", "button": "right", "text": "Mouse right"})
	var button := InputEventJoypadButton.new()
	button.button_index = JOY_BUTTON_START
	assert_eq(InputEventCodec.describe(button), {"type": "joypad_button", "button": "start", "text": "Joypad start"})
	var motion := InputEventJoypadMotion.new()
	motion.axis = JOY_AXIS_RIGHT_X
	motion.axis_value = 1.0
	assert_eq(InputEventCodec.describe(motion), {"type": "joypad_motion", "axis": "right_x", "direction": 1, "text": "Joypad right_x +"})


func test_describes_a_key_set_by_its_logical_code() -> void:
	var key := InputEventKey.new()
	key.keycode = KEY_ESCAPE
	assert_eq((InputEventCodec.describe(key) as Dictionary)["key"], "Escape")
