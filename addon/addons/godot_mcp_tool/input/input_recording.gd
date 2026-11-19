extends RefCounted

const GodotMcpInputEventCodec := preload("input_event_codec.gd")

const MAXIMUM_STEP_FRAMES := 3600
const MOTION_SPAN_FRAMES := 6
const CLICK_PHYSICS_FRAMES := 2
const STICK_DEAD_ZONE := 0.2
const STICK_STEPS_PER_UNIT := 10.0
const MOTION_STEPS_PER_PIXEL := 10.0
const STRENGTH_STEPS_PER_UNIT := 100.0
const MODIFIER_KEYS := [KEY_SHIFT, KEY_CTRL, KEY_ALT, KEY_META]
const POINTER_BUTTONS := {MOUSE_BUTTON_LEFT: "left", MOUSE_BUTTON_RIGHT: "right", MOUSE_BUTTON_MIDDLE: "middle"}
const WHEEL_DIRECTIONS := {MOUSE_BUTTON_WHEEL_UP: "up", MOUSE_BUTTON_WHEEL_DOWN: "down", MOUSE_BUTTON_WHEEL_LEFT: "left", MOUSE_BUTTON_WHEEL_RIGHT: "right"}
const PRESSABLE_KINDS := ["button", "mouse_button", "touch"]


static func record_of(event: InputEvent, frame: int, to_view: Transform2D, action_of: Callable) -> Variant:
	if event is InputEventKey:
		return _key_record(event as InputEventKey, frame, action_of)
	if event is InputEventJoypadButton:
		var action: String = action_of.call(event)
		var target := {"action": action} if not action.is_empty() else {"joypad_button": GodotMcpInputEventCodec.describe(event)["button"]}
		return _button_record(frame, target, (event as InputEventJoypadButton).pressed)
	if event is InputEventAction:
		var action_event := event as InputEventAction
		var target := {"action": str(action_event.action)}
		if action_event.pressed and action_event.strength < 1.0:
			target["strength"] = roundf(action_event.strength * STRENGTH_STEPS_PER_UNIT) / STRENGTH_STEPS_PER_UNIT
		return _button_record(frame, target, action_event.pressed)
	if event is InputEventMouseButton:
		return _mouse_button_record(event as InputEventMouseButton, frame, to_view)
	if event is InputEventMouseMotion:
		return {"frame": frame, "kind": "mouse_motion", "relative": to_view.basis_xform((event as InputEventMouseMotion).relative)}
	if event is InputEventJoypadMotion:
		return {"frame": frame, "kind": "joypad_motion", "axis": GodotMcpInputEventCodec.describe(event)["axis"], "value": (event as InputEventJoypadMotion).axis_value}
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		return {"frame": frame, "kind": "touch", "finger": touch.index, "pressed": touch.pressed, "position": _pixels(to_view * touch.position)}
	if event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		return {"frame": frame, "kind": "touch_drag", "finger": drag.index, "relative": to_view.basis_xform(drag.relative)}
	return null


static func steps_of(records: Array, start_frame: int, stop_frame: int) -> Array:
	var reduced := _reduced_sticks(_merged_motions(records))
	var steps: Array = []
	var cursor := start_frame
	var held := {}
	var released := {}
	for index in reduced.size():
		if released.has(index):
			continue
		var record: Dictionary = reduced[index]
		_wait(steps, record["frame"] - cursor)
		cursor = maxi(cursor, record["frame"])
		if record["kind"] in PRESSABLE_KINDS:
			var identity := _identity(record)
			var release := index + 1
			if record["pressed"] and release < reduced.size() and _releases(reduced[release], identity) and reduced[release]["frame"] - record["frame"] <= MAXIMUM_STEP_FRAMES:
				steps.append(_tap(record, reduced[release]["frame"] - record["frame"]))
				released[release] = true
				cursor = record["frame"] + CLICK_PHYSICS_FRAMES if record["kind"] == "mouse_button" else reduced[release]["frame"]
			elif record["pressed"]:
				steps.append(_held_step(record, "down"))
				held[identity] = true
			else:
				steps.append(_held_step(record, "up"))
				held.erase(identity)
			continue
		steps.append(_motion_step(record))
		if record["kind"] == "wheel":
			cursor += int(record["clicks"])
	if not held.is_empty():
		_wait(steps, stop_frame - cursor)
	return steps


static func _key_record(key: InputEventKey, frame: int, action_of: Callable) -> Variant:
	if key.echo:
		return null
	var action: String = action_of.call(key)
	if not action.is_empty():
		return _button_record(frame, {"action": action}, key.pressed)
	if key.physical_keycode in MODIFIER_KEYS or key.keycode in MODIFIER_KEYS:
		return null
	var described := GodotMcpInputEventCodec.describe(key)
	var target := {"key": described["key"]}
	for modifier in GodotMcpInputEventCodec.KEY_MODIFIERS:
		if described.get(modifier, false):
			target[modifier] = true
	return _button_record(frame, target, key.pressed)


static func _mouse_button_record(button: InputEventMouseButton, frame: int, to_view: Transform2D) -> Variant:
	var position := _pixels(to_view * button.position)
	if WHEEL_DIRECTIONS.has(button.button_index):
		return {"frame": frame, "kind": "wheel", "direction": WHEEL_DIRECTIONS[button.button_index], "position": position} if button.pressed else null
	if not POINTER_BUTTONS.has(button.button_index):
		return null
	return {"frame": frame, "kind": "mouse_button", "button": POINTER_BUTTONS[button.button_index], "pressed": button.pressed, "double": button.double_click, "position": position}


static func _button_record(frame: int, target: Dictionary, pressed: bool) -> Dictionary:
	return {"frame": frame, "kind": "button", "target": target, "pressed": pressed}


static func _merged_motions(records: Array) -> Array:
	var merged: Array = []
	for record: Dictionary in records:
		var last: Dictionary = merged.back() if not merged.is_empty() else {}
		if not last.is_empty() and _joins(last, record):
			if record["kind"] == "wheel":
				last["clicks"] += 1
			else:
				last["relative"] += record["relative"]
			continue
		var copy := record.duplicate()
		if copy["kind"] == "wheel":
			copy["clicks"] = 1
		merged.append(copy)
	return merged


static func _joins(last: Dictionary, record: Dictionary) -> bool:
	if last["kind"] != record["kind"] or record["frame"] - last["frame"] >= MOTION_SPAN_FRAMES:
		return false
	match record["kind"]:
		"mouse_motion":
			return true
		"touch_drag":
			return last["finger"] == record["finger"]
		"wheel":
			return last["direction"] == record["direction"] and last["position"] == record["position"]
	return false


static func _reduced_sticks(records: Array) -> Array:
	var reduced: Array = []
	var stick_values := {}
	for record: Dictionary in records:
		if record["kind"] != "joypad_motion":
			reduced.append(record)
			continue
		var value: float = record["value"]
		var quantized := 0.0 if absf(value) < STICK_DEAD_ZONE else roundf(value * STICK_STEPS_PER_UNIT) / STICK_STEPS_PER_UNIT
		if is_equal_approx(quantized, stick_values.get(record["axis"], 0.0)):
			continue
		stick_values[record["axis"]] = quantized
		reduced.append({"frame": record["frame"], "kind": "stick", "axis": record["axis"], "value": quantized})
	return reduced


static func _wait(steps: Array, frames: int) -> void:
	var remaining := frames
	while remaining > 0:
		var chunk := mini(remaining, MAXIMUM_STEP_FRAMES)
		steps.append({"wait_physics_frames": chunk})
		remaining -= chunk


static func _identity(record: Dictionary) -> String:
	match record["kind"]:
		"button":
			return "button %s" % JSON.stringify(record["target"])
		"mouse_button":
			return "mouse %s" % record["button"]
	return "touch %d" % record["finger"]


static func _releases(record: Dictionary, identity: String) -> bool:
	return record["kind"] in PRESSABLE_KINDS and not record["pressed"] and _identity(record) == identity


static func _tap(record: Dictionary, frames: int) -> Dictionary:
	match record["kind"]:
		"button":
			return (record["target"] as Dictionary).merged({"physics_frames": maxi(1, frames)})
		"mouse_button":
			var click := {"click": record["position"]}
			if record["button"] != "left":
				click["button"] = record["button"]
			if record["double"]:
				click["double"] = true
			return click
	return _with_finger({"touch": record["position"], "physics_frames": maxi(1, frames)}, record)


static func _held_step(record: Dictionary, state: String) -> Dictionary:
	match record["kind"]:
		"button":
			var target := (record["target"] as Dictionary).duplicate()
			if state == "up":
				target.erase("strength")
			return target.merged({"state": state})
		"mouse_button":
			var click := {"click": record["position"], "state": state}
			if record["button"] != "left":
				click["button"] = record["button"]
			return click
	return _with_finger({"touch": record["position"], "state": state}, record)


static func _motion_step(record: Dictionary) -> Dictionary:
	match record["kind"]:
		"mouse_motion":
			return {"mouse_motion": _rounded(record["relative"])}
		"touch_drag":
			return _with_finger({"touch_drag": _rounded(record["relative"])}, record)
		"wheel":
			var wheel := {"wheel": record["direction"], "at": record["position"]}
			if int(record["clicks"]) > 1:
				wheel["clicks"] = record["clicks"]
			return wheel
	if is_zero_approx(record["value"]):
		return {"joypad_motion": record["axis"], "state": "up"}
	return {"joypad_motion": record["axis"], "value": record["value"], "state": "down"}


static func _with_finger(step: Dictionary, record: Dictionary) -> Dictionary:
	if int(record["finger"]) != 0:
		step["finger"] = record["finger"]
	return step


static func _pixels(point: Vector2) -> Array:
	return [roundi(point.x), roundi(point.y)]


static func _rounded(vector: Vector2) -> Array:
	return [roundf(vector.x * MOTION_STEPS_PER_PIXEL) / MOTION_STEPS_PER_PIXEL, roundf(vector.y * MOTION_STEPS_PER_PIXEL) / MOTION_STEPS_PER_PIXEL]
