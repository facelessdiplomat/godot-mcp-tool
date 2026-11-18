extends "../../commands/command.gd"

const GodotMcpCommand := preload("../../commands/command.gd")
const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpGameTime := preload("../game_time.gd")
const GodotMcpInputEventCodec := preload("../../input/input_event_codec.gd")
const GodotMcpMomentCamera := preload("../../capture/moment_camera.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpSignalWatch := preload("../signal_watch.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

const MAXIMUM_STEPS := 200
const MAXIMUM_PHYSICS_FRAMES := 3600
const MAXIMUM_MILLISECONDS := 60_000
const TAP_PHYSICS_FRAMES := 2
const STATES := ["tap", "down", "up"]
const STEP_KINDS := "{\"action\": name}, {\"key\": name}, {\"joypad_button\": name}, {\"joypad_motion\": axis, \"value\": v}, {\"mouse_motion\": [dx, dy]}, {\"click\": [x, y] or a Control path}, {\"wheel\": \"up\"}, {\"touch\": [x, y]}, {\"touch_drag\": [dx, dy]}, {\"text\": text}, {\"wait_ms\": n}, {\"wait_physics_frames\": n}, {\"read\": node, \"names\": [...]} or {\"screenshot\": true}"
const JOYPAD_DEVICE := 0
const WHEEL_BUTTONS := {"up": MOUSE_BUTTON_WHEEL_UP, "down": MOUSE_BUTTON_WHEEL_DOWN, "left": MOUSE_BUTTON_WHEEL_LEFT, "right": MOUSE_BUTTON_WHEEL_RIGHT}
const MAXIMUM_WHEEL_CLICKS := 20
const MAXIMUM_FINGER := 9
const SCREENSHOT_LABEL := "step %d, frame %d"
const FINAL_SCREENSHOT_LABEL := "end, frame %d"
const MAXIMUM_WATCHED_SIGNALS := 10

var _capture: GodotMcpCommand
var _time: GodotMcpGameTime
var _reader: GodotMcpCommand
var _scene: GodotMcpGameScene
var _moments: GodotMcpMomentCamera
var _codec := GodotMcpVariantCodec.new()
var _held := {}
var _mouse_mask := 0
var _fingers := {}


func _init(capture: GodotMcpCommand, time: GodotMcpGameTime, reader: GodotMcpCommand, scene: GodotMcpGameScene, moments: GodotMcpMomentCamera) -> void:
	_capture = capture
	_time = time
	_reader = reader
	_scene = scene
	_moments = moments


func execute(params: Dictionary) -> Variant:
	var steps: Variant = params.get("steps")
	var release_at_end: Variant = GodotMcpParams.flag(params, "release_at_end", true)
	var take_screenshot: Variant = GodotMcpParams.flag(params, "screenshot", false)
	for value in [release_at_end, take_screenshot]:
		if value is GodotMcpCommandError:
			return value
	if not steps is Array or (steps as Array).is_empty() or (steps as Array).size() > MAXIMUM_STEPS:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"\"steps\" needs from 1 to %d steps" % MAXIMUM_STEPS,
			"Example: {\"steps\": [{\"action\": \"move_forward\", \"ms\": 1000}, {\"action\": \"jump\"}]}",
		)
	var planned: Array = []
	for index in (steps as Array).size():
		var step: Variant = _plan(steps[index])
		if step is String:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Step %d: %s" % [index + 1, step], "Each step is one of %s." % STEP_KINDS)
		planned.append(step)
	var watches: Variant = _signal_watches(params.get("watch_signals", []))
	if watches is GodotMcpCommandError:
		return watches
	var screenshot_count := planned.filter(func(step: Dictionary) -> bool: return step["kind"] == "screenshot").size() + (1 if take_screenshot else 0)
	if screenshot_count > GodotMcpMomentCamera.MAXIMUM_MOMENTS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "One input takes up to %d screenshots, not %d" % [GodotMcpMomentCamera.MAXIMUM_MOMENTS, screenshot_count], "Split the input into several calls.")
	var tree := Engine.get_main_loop() as SceneTree
	var started_msec := Time.get_ticks_msec()
	var first_frame := _time.frames
	var reads: Array = []
	var clicked: Array = []
	var moments: Array = []
	var moment_labels := PackedStringArray()
	var screenshot_errors := PackedStringArray()
	var failed_step := {}
	for watch: GodotMcpSignalWatch in watches:
		watch.start()
	for index in planned.size():
		var step: Dictionary = planned[index]
		for watch: GodotMcpSignalWatch in watches:
			watch.step = index + 1
		match step["kind"]:
			"read":
				reads.append(_read(step, index + 1, _time.frames - first_frame))
			"screenshot":
				var moment: Variant = await _moments.grab()
				if moment is GodotMcpCommandError:
					screenshot_errors.append((moment as GodotMcpCommandError).message)
				else:
					moments.append(moment)
					moment_labels.append(SCREENSHOT_LABEL % [index + 1, _time.frames - first_frame])
			_:
				var problem: Variant = await _perform(step, tree, index + 1, clicked)
				if problem is String:
					failed_step = {"step": index + 1, "error": problem}
					break
	for watch: GodotMcpSignalWatch in watches:
		watch.stop()
	var released: Array = []
	if release_at_end:
		released = _held.keys()
		for label in released:
			_send(_held[label], false)
		_held.clear()
		_mouse_mask = 0
		_fingers.clear()
	var played := {
		"steps": planned.size(),
		"waited_ms": Time.get_ticks_msec() - started_msec,
		"released": released,
		"held": _held.keys(),
		"physics_frames": _time.frames - first_frame,
		"paused": _time.is_held(),
		"game_frame": _time.frames,
	}
	if not reads.is_empty():
		played["reads"] = reads
	if not clicked.is_empty():
		played["clicked"] = clicked
	if not failed_step.is_empty():
		played["failed_step"] = failed_step
	if not (watches as Array).is_empty():
		played["signals"] = (watches as Array).map(func(watch: GodotMcpSignalWatch) -> Dictionary: return watch.describe())
	if not moments.is_empty() or not screenshot_errors.is_empty():
		if take_screenshot:
			var final_moment: Variant = await _moments.grab()
			if final_moment is GodotMcpCommandError:
				screenshot_errors.append((final_moment as GodotMcpCommandError).message)
			else:
				moments.append(final_moment)
				moment_labels.append(FINAL_SCREENSHOT_LABEL % (_time.frames - first_frame))
		if not moments.is_empty():
			var sheet: Variant = await _moments.save(moments, moment_labels, {"max_size": 1280, "format": "png"})
			if sheet is GodotMcpCommandError:
				screenshot_errors.append((sheet as GodotMcpCommandError).message)
			else:
				(sheet as Dictionary).merge({"scene": _scene.scene_path(), "views": []})
				played["screenshot"] = sheet
		if not screenshot_errors.is_empty():
			played["screenshot_error"] = screenshot_errors[0]
	elif take_screenshot:
		var capture: Variant = await _capture.execute({})
		if capture is GodotMcpCommandError:
			played["screenshot_error"] = (capture as GodotMcpCommandError).message
		else:
			played["screenshot"] = capture
	return played


func _signal_watches(requests: Variant) -> Variant:
	if requests == null:
		return []
	if not requests is Array or (requests as Array).size() > MAXIMUM_WATCHED_SIGNALS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"watch_signals\" is a list of up to %d signals" % MAXIMUM_WATCHED_SIGNALS, "Example: [{\"node\": \"Player\", \"signal\": \"landed\"}]")
	var watches: Array = []
	for request: Variant in requests:
		if not request is Dictionary or not (request as Dictionary).get("signal") is String:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Each watched signal is {\"node\": path, \"signal\": name}", "Example: {\"node\": \"Player\", \"signal\": \"landed\"}")
		var node_path := str((request as Dictionary).get("node", "."))
		var signal_name := str(request["signal"])
		var node: Variant = _scene.resolve(node_path)
		if node is GodotMcpCommandError:
			return node
		if not (node as Node).has_signal(signal_name):
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has no signal \"%s\" to watch" % [node_path, signal_name], GodotMcpSignalWatch.missing_signal_hint(node, signal_name))
		watches.append(GodotMcpSignalWatch.new(node, node_path, signal_name, _time, _codec))
	return watches


func _perform(step: Dictionary, tree: SceneTree, step_number: int, clicked: Array) -> Variant:
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
			return await _press_mouse(step, tree, step_number, clicked)
		"wheel":
			await _scroll(step, tree)
		"touch":
			await _touch(step, tree)
		"touch_drag":
			return _drag_finger(step, tree)
		"text":
			_type(step["text"])
		"wait":
			await _wait(step["hold"], tree)
	return null


func _read(step: Dictionary, step_number: int, physics_frames: int) -> Dictionary:
	var outcome: Variant = _reader.execute({"path": step["path"], "names": step["names"]})
	var read := {"step": step_number, "physics_frames": physics_frames, "path": step["path"]}
	if outcome is GodotMcpCommandError:
		read["error"] = (outcome as GodotMcpCommandError).message
	else:
		read.merge(outcome, true)
	return read


static func _plan(step: Variant) -> Variant:
	if not step is Dictionary:
		return "a step is an object such as {\"action\": \"jump\"}"
	var description := step as Dictionary
	if description.has("action"):
		return _plan_button(description, _action_target(str(description["action"]), description.get("strength", 1.0)))
	if description.has("key"):
		return _plan_button(description, _key_target(description))
	if description.has("joypad_button"):
		return _plan_button(description, _joypad_button_target(description))
	if description.has("joypad_motion"):
		return _plan_button(description, _joypad_motion_target(description))
	if description.has("mouse_motion"):
		var relative: Variant = _vector_of(description["mouse_motion"])
		return {"kind": "mouse_motion", "relative": relative} if relative is Vector2 else "mouse_motion is [dx, dy] in pixels of the game view"
	if description.has("click"):
		return _plan_click(description)
	if description.has("wheel"):
		return _plan_wheel(description)
	if description.has("touch"):
		return _plan_touch(description)
	if description.has("touch_drag"):
		return _plan_touch_drag(description)
	if description.has("screenshot"):
		return {"kind": "screenshot"} if description["screenshot"] == true else "a screenshot step is {\"screenshot\": true}"
	if description.has("text"):
		var text: Variant = description["text"]
		return {"kind": "text", "text": text} if text is String and not (text as String).is_empty() else "text needs at least one character"
	if description.has("wait_ms") or description.has("wait_physics_frames"):
		var hold: Variant = _plan_duration(description.get("wait_physics_frames"), description.get("wait_ms"), 0)
		return {"kind": "wait", "hold": hold} if hold is Dictionary else hold
	if description.has("read"):
		return _plan_read(description)
	return "unknown step %s" % JSON.stringify(step)


static func _plan_read(description: Dictionary) -> Variant:
	var path: Variant = description["read"]
	var names: Variant = description.get("names")
	if not path is String or (path as String).is_empty():
		return "read is the path of a node in the running game, such as \"Player\""
	if not names is Array or (names as Array).is_empty() or not (names as Array).all(func(name: Variant) -> bool: return name is String and not (name as String).is_empty()):
		return "a read step lists the properties to read in names, such as [\"position\", \"is_on_floor()\"]"
	return {"kind": "read", "path": path, "names": names}


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
		var similar := GodotMcpSimilarNames.hint(action, known_actions)
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
	var decoded: Variant = GodotMcpInputEventCodec.decode(key_description)
	if decoded is String:
		return decoded
	var event := decoded as InputEventKey
	event.keycode = event.physical_keycode
	return {"label": "key %s" % description["key"], "event": event}


static func _joypad_button_target(description: Dictionary) -> Variant:
	var decoded: Variant = GodotMcpInputEventCodec.decode({"type": "joypad_button", "button": description["joypad_button"]})
	if decoded is String:
		return decoded
	var event := decoded as InputEventJoypadButton
	event.device = JOYPAD_DEVICE
	return {"label": "joypad_button %s" % description["joypad_button"], "event": event}


static func _joypad_motion_target(description: Dictionary) -> Variant:
	var value: Variant = description.get("value")
	var centers := str(description.get("state", "tap")) == "up"
	if not centers and not ((value is int or value is float) and absf(value) <= 1.0):
		return "joypad_motion needs a value from -1 to 1, such as {\"joypad_motion\": \"left_x\", \"value\": 0.5}"
	var decoded: Variant = GodotMcpInputEventCodec.decode({"type": "joypad_motion", "axis": description["joypad_motion"], "direction": 1})
	if decoded is String:
		return decoded
	var event := decoded as InputEventJoypadMotion
	event.device = JOYPAD_DEVICE
	event.axis_value = 0.0 if centers else float(value)
	return {"label": "joypad_motion %s" % description["joypad_motion"], "event": event}


static func _plan_click(description: Dictionary) -> Variant:
	var state := str(description.get("state", "tap"))
	if not state in STATES:
		return "state is tap, down or up"
	var button_name := str(description.get("button", "left"))
	var button: Variant = GodotMcpInputEventCodec.decode({"type": "mouse_button", "button": button_name})
	if button is String:
		return button
	var double: bool = description.get("double", false) == true
	if double and state != "tap":
		return "double works only with state tap"
	var step := {"kind": "click", "button": (button as InputEventMouseButton).button_index, "label": "mouse %s" % button_name, "double": double, "state": state}
	var target: Variant = description["click"]
	if target is String and not (target as String).is_empty():
		step["path"] = target
		return step
	var position: Variant = _vector_of(target)
	if not position is Vector2:
		return "click is [x, y] in pixels of the game view, as in game screenshots, or the path of a Control, such as \"Menu/Resume\""
	step["position"] = position
	return step


static func _plan_wheel(description: Dictionary) -> Variant:
	var direction := str(description["wheel"])
	if not WHEEL_BUTTONS.has(direction):
		return "wheel is up, down, left or right"
	var clicks: Variant = description.get("clicks", 1)
	if not _is_count(clicks, MAXIMUM_WHEEL_CLICKS):
		return "clicks is a whole number from 1 to %d" % MAXIMUM_WHEEL_CLICKS
	var position: Variant = null
	if description.has("at"):
		position = _vector_of(description["at"])
		if not position is Vector2:
			return "at is [x, y] in pixels of the game view"
	return {"kind": "wheel", "button": WHEEL_BUTTONS[direction], "clicks": int(clicks), "position": position}


static func _plan_touch(description: Dictionary) -> Variant:
	var position: Variant = _vector_of(description["touch"])
	if not position is Vector2:
		return "touch is [x, y] in pixels of the game view"
	var finger: Variant = _finger_of(description)
	if finger is String:
		return finger
	var state := str(description.get("state", "tap"))
	if not state in STATES:
		return "state is tap, down or up"
	var hold: Variant = _plan_duration(description.get("physics_frames"), description.get("ms"), TAP_PHYSICS_FRAMES)
	if hold is String:
		return hold
	return {"kind": "touch", "position": position, "finger": finger, "state": state, "hold": hold}


static func _plan_touch_drag(description: Dictionary) -> Variant:
	var relative: Variant = _vector_of(description["touch_drag"])
	if not relative is Vector2:
		return "touch_drag is [dx, dy] in pixels of the game view"
	var finger: Variant = _finger_of(description)
	if finger is String:
		return finger
	return {"kind": "touch_drag", "relative": relative, "finger": finger}


static func _finger_of(description: Dictionary) -> Variant:
	var finger: Variant = description.get("finger", 0)
	if not ((finger is int or finger is float) and finger == floorf(finger) and finger >= 0 and finger <= MAXIMUM_FINGER):
		return "finger is a whole number from 0 to %d" % MAXIMUM_FINGER
	return int(finger)


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


func _send(template: InputEvent, pressed: bool) -> void:
	var event := template.duplicate() as InputEvent
	if event is InputEventJoypadMotion:
		if not pressed:
			(event as InputEventJoypadMotion).axis_value = 0.0
	else:
		event.set("pressed", pressed)
	if event is InputEventMouseButton and not pressed:
		_mouse_mask &= ~_mask_of((event as InputEventMouseButton).button_index)
		(event as InputEventMouseButton).button_mask = _mouse_mask
	_time.deliver(event)


func _move_mouse(relative: Vector2, tree: SceneTree) -> void:
	var window := tree.root
	var to_window := window.get_final_transform()
	var event := InputEventMouseMotion.new()
	event.relative = to_window.basis_xform(relative)
	event.position = to_window * window.get_mouse_position() + event.relative
	event.global_position = event.position
	event.button_mask = _mouse_mask
	_time.deliver(event)


func _press_mouse(step: Dictionary, tree: SceneTree, step_number: int, clicked: Array) -> Variant:
	var position_in_view: Variant = step.get("position")
	if step.has("path"):
		var center: Variant = _control_center(step["path"], tree)
		if center is String:
			return center
		position_in_view = center
		clicked.append({"step": step_number, "path": step["path"], "at": [roundi((center as Vector2).x), roundi((center as Vector2).y)]})
	var position := tree.root.get_final_transform() * (position_in_view as Vector2)
	match step["state"]:
		"tap":
			await _click(position, step["button"], step["double"], tree)
		"down":
			_hover(position)
			var press := _mouse_button(position, step["button"], true, false)
			_time.deliver(press)
			_held[step["label"]] = press
		"up":
			_hover(position)
			_mouse_mask &= ~_mask_of(step["button"])
			_time.deliver(_mouse_button(position, step["button"], false, false))
			_held.erase(step["label"])
	return null


func _control_center(path: String, tree: SceneTree) -> Variant:
	var resolved: Variant = _scene.resolve(path)
	if resolved is GodotMcpCommandError:
		return (resolved as GodotMcpCommandError).message
	if not resolved is Control:
		return "%s is %s, not a Control; click other nodes by their position in a screenshot" % [path, (resolved as Node).get_class()]
	var control := resolved as Control
	if not control.is_visible_in_tree():
		return "%s is not visible, so it cannot be clicked" % path
	if control.get_viewport() != tree.root:
		return "%s is inside a SubViewport; click its position in a screenshot instead" % path
	return control.get_global_transform_with_canvas() * (control.size / 2.0)


func _click(position: Vector2, button_index: int, double: bool, tree: SceneTree) -> void:
	var was_held := _time.let_run()
	_hover(position)
	for click_number in (2 if double else 1):
		_time.deliver(_mouse_button(position, button_index, true, click_number == 1))
		await tree.process_frame
		_mouse_mask &= ~_mask_of(button_index)
		_time.deliver(_mouse_button(position, button_index, false, false))
		await tree.process_frame
	_time.hold_again_if(was_held)


func _hover(position: Vector2) -> void:
	var hover := InputEventMouseMotion.new()
	hover.position = position
	hover.global_position = position
	hover.button_mask = _mouse_mask
	_time.deliver(hover)


func _scroll(step: Dictionary, tree: SceneTree) -> void:
	var was_held := _time.let_run()
	var window := tree.root
	var position: Vector2 = window.get_final_transform() * (window.get_mouse_position() if step["position"] == null else step["position"] as Vector2)
	for click in int(step["clicks"]):
		for pressed in [true, false]:
			var event := InputEventMouseButton.new()
			event.button_index = step["button"]
			event.pressed = pressed
			event.factor = 1.0
			event.position = position
			event.global_position = position
			event.button_mask = _mouse_mask | (_mask_of(step["button"]) if pressed else 0)
			_time.deliver(event)
		await tree.process_frame
	_time.hold_again_if(was_held)


func _touch(step: Dictionary, tree: SceneTree) -> void:
	var finger: int = step["finger"]
	var label := "touch %d" % finger
	var position := tree.root.get_final_transform() * (step["position"] as Vector2)
	if step["state"] != "up":
		var press := _screen_touch(finger, position, true)
		_time.deliver(press)
		_fingers[finger] = position
		_held[label] = press
	if step["state"] == "tap":
		await _wait(step["hold"], tree)
	if step["state"] != "down":
		_time.deliver(_screen_touch(finger, position, false))
		_fingers.erase(finger)
		_held.erase(label)


func _drag_finger(step: Dictionary, tree: SceneTree) -> Variant:
	var finger: int = step["finger"]
	if not _fingers.has(finger):
		return "finger %d is not down; put it down first with {\"touch\": [x, y], \"finger\": %d, \"state\": \"down\"}" % [finger, finger]
	var relative := tree.root.get_final_transform().basis_xform(step["relative"] as Vector2)
	var event := InputEventScreenDrag.new()
	event.index = finger
	event.position = (_fingers[finger] as Vector2) + relative
	event.relative = relative
	event.screen_relative = relative
	event.velocity = relative * Engine.physics_ticks_per_second
	event.screen_velocity = event.velocity
	_time.deliver(event)
	_fingers[finger] = event.position
	return null


static func _screen_touch(finger: int, position: Vector2, pressed: bool) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.index = finger
	event.position = position
	event.pressed = pressed
	return event


func _mouse_button(position: Vector2, button_index: int, pressed: bool, double_click: bool) -> InputEventMouseButton:
	if pressed:
		_mouse_mask |= _mask_of(button_index)
	var event := InputEventMouseButton.new()
	event.position = position
	event.global_position = position
	event.button_index = button_index
	event.pressed = pressed
	event.double_click = double_click
	event.button_mask = _mouse_mask
	return event


static func _mask_of(button_index: int) -> int:
	return 1 << (button_index - 1)


func _type(text: String) -> void:
	for character in text:
		for pressed in [true, false]:
			var event := InputEventKey.new()
			event.unicode = character.unicode_at(0)
			event.pressed = pressed
			_time.deliver(event)


func _wait(hold: Dictionary, tree: SceneTree) -> void:
	var was_held := _time.let_run()
	if hold.has("ms"):
		var deadline_msec := Time.get_ticks_msec() + int(hold["ms"])
		while Time.get_ticks_msec() < deadline_msec:
			await tree.process_frame
	else:
		for frame in int(hold["physics_frames"]):
			await _time.physics_frame_ended
	_time.hold_again_if(was_held)
