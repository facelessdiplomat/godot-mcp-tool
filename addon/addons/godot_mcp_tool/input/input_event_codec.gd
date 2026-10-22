extends RefCounted

const SimilarNames := preload("../util/similar_names.gd")

const EVENT_TYPES := "key, mouse_button, joypad_button or joypad_motion"
const KEY_MODIFIERS := {"shift": KEY_MASK_SHIFT, "ctrl": KEY_MASK_CTRL, "alt": KEY_MASK_ALT, "meta": KEY_MASK_META}
const MOUSE_BUTTONS := {
	"left": MOUSE_BUTTON_LEFT,
	"right": MOUSE_BUTTON_RIGHT,
	"middle": MOUSE_BUTTON_MIDDLE,
	"wheel_up": MOUSE_BUTTON_WHEEL_UP,
	"wheel_down": MOUSE_BUTTON_WHEEL_DOWN,
	"wheel_left": MOUSE_BUTTON_WHEEL_LEFT,
	"wheel_right": MOUSE_BUTTON_WHEEL_RIGHT,
	"extra_1": MOUSE_BUTTON_XBUTTON1,
	"extra_2": MOUSE_BUTTON_XBUTTON2,
}
const JOYPAD_BUTTONS := {
	"a": JOY_BUTTON_A,
	"b": JOY_BUTTON_B,
	"x": JOY_BUTTON_X,
	"y": JOY_BUTTON_Y,
	"back": JOY_BUTTON_BACK,
	"guide": JOY_BUTTON_GUIDE,
	"start": JOY_BUTTON_START,
	"left_stick": JOY_BUTTON_LEFT_STICK,
	"right_stick": JOY_BUTTON_RIGHT_STICK,
	"left_shoulder": JOY_BUTTON_LEFT_SHOULDER,
	"right_shoulder": JOY_BUTTON_RIGHT_SHOULDER,
	"dpad_up": JOY_BUTTON_DPAD_UP,
	"dpad_down": JOY_BUTTON_DPAD_DOWN,
	"dpad_left": JOY_BUTTON_DPAD_LEFT,
	"dpad_right": JOY_BUTTON_DPAD_RIGHT,
}
const JOYPAD_AXES := {
	"left_x": JOY_AXIS_LEFT_X,
	"left_y": JOY_AXIS_LEFT_Y,
	"right_x": JOY_AXIS_RIGHT_X,
	"right_y": JOY_AXIS_RIGHT_Y,
	"trigger_left": JOY_AXIS_TRIGGER_LEFT,
	"trigger_right": JOY_AXIS_TRIGGER_RIGHT,
}
const SPECIAL_KEYS := [
	KEY_SPACE, KEY_ENTER, KEY_ESCAPE, KEY_TAB, KEY_BACKSPACE, KEY_DELETE, KEY_INSERT, KEY_HOME, KEY_END,
	KEY_PAGEUP, KEY_PAGEDOWN, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META, KEY_CAPSLOCK,
]


static func decode(description: Variant) -> Variant:
	if description is String:
		return _key({"key": description})
	if not description is Dictionary:
		return "Describe an input event as a key name such as \"Space\", or as an object such as {\"type\": \"key\", \"key\": \"W\"}"
	var event_type := str((description as Dictionary).get("type", ""))
	match event_type:
		"key":
			return _key(description)
		"mouse_button":
			return _mouse_button(description)
		"joypad_button":
			return _joypad_button(description)
		"joypad_motion":
			return _joypad_motion(description)
	return "Unknown input event type \"%s\"; use %s" % [event_type, EVENT_TYPES]


static func describe(event: InputEvent) -> Dictionary:
	var described := {}
	if event is InputEventKey:
		described = _describe_key(event)
	elif event is InputEventMouseButton:
		described = {"type": "mouse_button", "button": _name_of(MOUSE_BUTTONS, (event as InputEventMouseButton).button_index)}
	elif event is InputEventJoypadButton:
		described = {"type": "joypad_button", "button": _name_of(JOYPAD_BUTTONS, (event as InputEventJoypadButton).button_index)}
	elif event is InputEventJoypadMotion:
		var motion := event as InputEventJoypadMotion
		described = {"type": "joypad_motion", "axis": _name_of(JOYPAD_AXES, motion.axis), "direction": 1 if motion.axis_value >= 0.0 else -1}
	else:
		described = {"type": "other"}
	described["text"] = _short_text(described, event)
	return described


static func key_names() -> PackedStringArray:
	var names := PackedStringArray()
	for code in range(KEY_A, KEY_Z + 1) + range(KEY_0, KEY_9 + 1) + range(KEY_F1, KEY_F12 + 1) + SPECIAL_KEYS:
		names.append(OS.get_keycode_string(code))
	return names


static func _key(description: Dictionary) -> Variant:
	var key_name := str(description.get("key", ""))
	var combined_code := OS.find_keycode_from_string(key_name)
	var keycode := combined_code & KEY_CODE_MASK
	if keycode == KEY_NONE:
		var similar := SimilarNames.hint(key_name, Array(key_names()))
		return "There is no key named \"%s\". %s" % [key_name, similar if not similar.is_empty() else "Use names such as \"W\", \"Space\", \"Up\" or \"F1\"."]
	var event := InputEventKey.new()
	event.physical_keycode = keycode
	for modifier in KEY_MODIFIERS:
		event.set("%s_pressed" % modifier, description.get(modifier, false) == true or combined_code & KEY_MODIFIERS[modifier] != 0)
	return event


static func _mouse_button(description: Dictionary) -> Variant:
	var button: Variant = _code_of(MOUSE_BUTTONS, description.get("button", "left"))
	if button == null:
		return "Unknown mouse button \"%s\"; use %s" % [description.get("button"), ", ".join(PackedStringArray(MOUSE_BUTTONS.keys()))]
	var event := InputEventMouseButton.new()
	event.button_index = button
	return event


static func _joypad_button(description: Dictionary) -> Variant:
	var button: Variant = _code_of(JOYPAD_BUTTONS, description.get("button"))
	if button == null:
		return "Unknown joypad button \"%s\"; use a number or %s" % [description.get("button"), ", ".join(PackedStringArray(JOYPAD_BUTTONS.keys()))]
	var event := InputEventJoypadButton.new()
	event.button_index = button
	return event


static func _joypad_motion(description: Dictionary) -> Variant:
	var axis: Variant = _code_of(JOYPAD_AXES, description.get("axis"))
	if axis == null:
		return "Unknown joypad axis \"%s\"; use a number or %s" % [description.get("axis"), ", ".join(PackedStringArray(JOYPAD_AXES.keys()))]
	var direction: Variant = description.get("direction")
	if not (direction is int or direction is float) or not (direction == 1 or direction == -1):
		return "A joypad_motion needs a direction: -1 or 1"
	var event := InputEventJoypadMotion.new()
	event.axis = axis
	event.axis_value = float(direction)
	return event


static func _code_of(names: Dictionary, value: Variant) -> Variant:
	if value is String and names.has(value):
		return names[value]
	if (value is int or value is float) and value == floorf(value) and value >= 0:
		return int(value)
	return null


static func _name_of(names: Dictionary, code: int) -> Variant:
	for code_name in names:
		if names[code_name] == code:
			return code_name
	return code


static func _short_text(described: Dictionary, event: InputEvent) -> String:
	match described["type"]:
		"key":
			return OS.get_keycode_string(_code_with_modifiers(event as InputEventKey))
		"mouse_button":
			return "Mouse %s" % described["button"]
		"joypad_button":
			return "Joypad %s" % described["button"]
		"joypad_motion":
			return "Joypad %s %s" % [described["axis"], "+" if described["direction"] > 0 else "-"]
	return event.as_text()


static func _code_with_modifiers(event: InputEventKey) -> int:
	var code := event.physical_keycode if event.physical_keycode != KEY_NONE else event.keycode
	for modifier in KEY_MODIFIERS:
		if event.get("%s_pressed" % modifier):
			code |= KEY_MODIFIERS[modifier]
	return code


static func _describe_key(event: InputEventKey) -> Dictionary:
	var code := event.physical_keycode if event.physical_keycode != KEY_NONE else event.keycode
	var described := {"type": "key", "key": OS.get_keycode_string(code)}
	for modifier in KEY_MODIFIERS:
		if event.get("%s_pressed" % modifier):
			described[modifier] = true
	return described
