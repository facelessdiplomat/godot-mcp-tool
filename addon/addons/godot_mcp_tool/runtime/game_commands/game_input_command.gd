extends "../../commands/command.gd"

const InputEventCodec := preload("../../input/input_event_codec.gd")
const Params := preload("../../commands/params.gd")
const SimilarNames := preload("../../util/similar_names.gd")

const MAXIMUM_STEPS := 200
const MAXIMUM_PHYSICS_FRAMES := 3600
const MAXIMUM_MILLISECONDS := 60_000
const TAP_PHYSICS_FRAMES := 2
const STATES := ["tap", "down", "up"]
const STEP_KINDS := "{\"action\": name}, {\"key\": name}, {\"mouse_motion\": [dx, dy]}, {\"click\": [x, y]}, {\"text\": text}, {\"wait_ms\": n} or {\"wait_physics_frames\": n}"

var _held := {}


func execute(params: Dictionary) -> Variant:
	var steps: Variant = params.get("steps")
	var release_at_end: Variant = Params.flag(params, "release_at_end", true)
	if release_at_end is CommandError:
		return release_at_end
	if not steps is Array or (steps as Array).is_empty() or (steps as Array).size() > MAXIMUM_STEPS:
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"\"steps\" needs from 1 to %d steps" % MAXIMUM_STEPS,
			"Example: {\"steps\": [{\"action\": \"move_forward\", \"ms\": 1000}, {\"action\": \"jump\"}]}",
		)
	var planned: Array = []
	for index in (steps as Array).size():
		var step: Variant = _plan(steps[index])
		if step is String:
			return CommandError.new(JsonRpc.INVALID_PARAMS, "Step %d: %s" % [index + 1, step], "Each step is one of %s." % STEP_KINDS)
		planned.append(step)
	var tree := Engine.get_main_loop() as SceneTree
	var started_msec := Time.get_ticks_msec()
	for step in planned:
		await _perform(step, tree)
	var released: Array = []
	if release_at_end:
		released = _held.keys()
		for label in released:
			_send(_held[label], false)
		_held.clear()
	return {"steps": planned.size(), "waited_ms": Time.get_ticks_msec() - started_msec, "released": released, "held": _held.keys()}


func _perform(step: Dictionary, tree: SceneTree) -> void:
	match step["kind"]:
		"button":
			if step["state"] != "up":
				_send(step["event"], true)
				_held[step["label"]] = step["event"]
			if step["state"] == "tap":
				await _wait(step["hold"], tree)
			if step["state"] != "down":
				_send(step["event"], false)
				_held.erase(step["label"])
		"mouse_motion":
			_move_mouse(step["relative"], tree)
		"click":
			await _click(step["position"], step["button"], step["double"], tree)
		"text":
			_type(step["text"])
		"wait":
			await _wait(step["hold"], tree)


static func _plan(step: Variant) -> Variant:
	if not step is Dictionary:
		return "a step is an object such as {\"action\": \"jump\"}"
	var description := step as Dictionary
	if description.has("action"):
		return _plan_button(description, _action_target(str(description["action"]), description.get("strength", 1.0)))
	if description.has("key"):
		return _plan_button(description, _key_target(description))
	if description.has("mouse_motion"):
		var relative: Variant = _vector_of(description["mouse_motion"])
		return {"kind": "mouse_motion", "relative": relative} if relative is Vector2 else "mouse_motion is [dx, dy] in pixels of the game view"
	if description.has("click"):
		return _plan_click(description)
	if description.has("text"):
		var text: Variant = description["text"]
		return {"kind": "text", "text": text} if text is String and not (text as String).is_empty() else "text needs at least one character"
	if description.has("wait_ms") or description.has("wait_physics_frames"):
		var hold: Variant = _plan_duration(description.get("wait_physics_frames"), description.get("wait_ms"), 0)
		return {"kind": "wait", "hold": hold} if hold is Dictionary else hold
	return "unknown step %s" % JSON.stringify(step)


static func _plan_button(description: Dictionary, target: Variant) -> Variant:
	if target is String:
		return target
	var state := str(description.get("state", "tap"))
	if not state in STATES:
		return "state is tap, down or up"
	var hold: Variant = _plan_duration(description.get("physics_frames"), description.get("ms"), TAP_PHYSICS_FRAMES)
	if hold is String:
		return hold
	return {"kind": "button", "label": target["label"], "event": target["event"], "state": state, "hold": hold}


static func _action_target(action: String, strength: Variant) -> Variant:
	if not InputMap.has_action(action):
		var known_actions := InputMap.get_actions().map(func(known_action: StringName) -> String: return str(known_action))
		var similar := SimilarNames.hint(action, known_actions)
		return "there is no input action \"%s\" in the running game. %s" % [action, similar if not similar.is_empty() else "Add it with input_map_set, then run the game again."]
	if not (strength is int or strength is float):
		return "strength is a number from 0 to 1"
	var event := InputEventAction.new()
	event.action = action
	event.strength = clampf(float(strength), 0.0, 1.0)
	return {"label": action, "event": event}


static func _key_target(description: Dictionary) -> Variant:
	var key_description := description.duplicate()
	key_description["type"] = "key"
	var decoded: Variant = InputEventCodec.decode(key_description)
	if decoded is String:
		return decoded
	var event := decoded as InputEventKey
	event.keycode = event.physical_keycode
	return {"label": "key %s" % description["key"], "event": event}


static func _plan_click(description: Dictionary) -> Variant:
	var position: Variant = _vector_of(description["click"])
	if not position is Vector2:
		return "click is [x, y] in pixels of the game view, as in game screenshots"
	var button: Variant = InputEventCodec.decode({"type": "mouse_button", "button": description.get("button", "left")})
	if button is String:
		return button
	return {"kind": "click", "position": position, "button": (button as InputEventMouseButton).button_index, "double": description.get("double", false) == true}


static func _plan_duration(physics_frames: Variant, milliseconds: Variant, default_physics_frames: int) -> Variant:
	if physics_frames != null and milliseconds != null:
		return "give a duration in physics_frames or in ms, not both"
	if milliseconds != null:
		return {"ms": milliseconds} if _is_count(milliseconds, MAXIMUM_MILLISECONDS) else "ms is a whole number from 1 to %d" % MAXIMUM_MILLISECONDS
	if physics_frames != null:
		return {"physics_frames": int(physics_frames)} if _is_count(physics_frames, MAXIMUM_PHYSICS_FRAMES) else "physics_frames is a whole number from 1 to %d" % MAXIMUM_PHYSICS_FRAMES
	if default_physics_frames > 0:
		return {"physics_frames": default_physics_frames}
	return "give a duration in wait_physics_frames or wait_ms"


static func _is_count(value: Variant, maximum: int) -> bool:
	return (value is int or value is float) and value == floorf(value) and value >= 1 and value <= maximum


static func _vector_of(value: Variant) -> Variant:
	if value is Array and (value as Array).size() == 2 and (value as Array).all(func(component: Variant) -> bool: return component is int or component is float):
		return Vector2(value[0], value[1])
	return null


static func _send(template: InputEvent, pressed: bool) -> void:
	var event := template.duplicate() as InputEvent
	event.set("pressed", pressed)
	_deliver(event)


static func _deliver(event: InputEvent) -> void:
	Input.parse_input_event(event)
	Input.flush_buffered_events()


static func _move_mouse(relative: Vector2, tree: SceneTree) -> void:
	var window := tree.root
	var to_window := window.get_final_transform()
	var event := InputEventMouseMotion.new()
	event.relative = to_window.basis_xform(relative)
	event.position = to_window * window.get_mouse_position() + event.relative
	event.global_position = event.position
	_deliver(event)


static func _click(position_in_view: Vector2, button_index: int, double: bool, tree: SceneTree) -> void:
	var position := tree.root.get_final_transform() * position_in_view
	var hover := InputEventMouseMotion.new()
	hover.position = position
	hover.global_position = position
	_deliver(hover)
	for click_number in (2 if double else 1):
		_deliver(_mouse_button(position, button_index, true, click_number == 1))
		await tree.process_frame
		_deliver(_mouse_button(position, button_index, false, false))
		await tree.process_frame


static func _mouse_button(position: Vector2, button_index: int, pressed: bool, double_click: bool) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.position = position
	event.global_position = position
	event.button_index = button_index
	event.pressed = pressed
	event.double_click = double_click
	event.button_mask = (1 << (button_index - 1)) if pressed else 0
	return event


static func _type(text: String) -> void:
	for character in text:
		for pressed in [true, false]:
			var event := InputEventKey.new()
			event.unicode = character.unicode_at(0)
			event.pressed = pressed
			_deliver(event)


static func _wait(hold: Dictionary, tree: SceneTree) -> void:
	if hold.has("ms"):
		var deadline_msec := Time.get_ticks_msec() + int(hold["ms"])
		while Time.get_ticks_msec() < deadline_msec:
			await tree.process_frame
		return
	for frame in int(hold["physics_frames"]):
		await tree.physics_frame
