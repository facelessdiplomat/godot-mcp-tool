extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpGameTime := preload("../game_time.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

const DEFAULT_TIMEOUT_MSEC := 10_000
const MAXIMUM_TIMEOUT_MSEC := 60_000
const MAXIMUM_FRAMES := 36_000
const WAIT_KINDS := ["frames", "physics_frames", "ms", "condition"]

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec
var _time: GodotMcpGameTime


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec, time: GodotMcpGameTime) -> void:
	_scene = scene
	_codec = codec
	_time = time


func execute(params: Dictionary) -> Variant:
	var requested_kinds := WAIT_KINDS.filter(func(kind: String) -> bool: return params.get(kind) != null)
	if requested_kinds.size() != 1:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"Pass exactly one of frames, physics_frames, ms or condition",
			"Example: {\"condition\": \"is_on_floor()\", \"node\": \"Player\"} or {\"physics_frames\": 60}",
		)
	var waited: Variant = await _wait(requested_kinds[0], params)
	if waited is Dictionary:
		(waited as Dictionary).merge({"paused": _time.is_held(), "game_frame": _time.frames})
	return waited


func _wait(kind: String, params: Dictionary) -> Variant:
	var started_msec := Time.get_ticks_msec()
	var tree := Engine.get_main_loop() as SceneTree
	match kind:
		"frames":
			var frames: Variant = GodotMcpParams.whole_number(params, "frames", 0)
			if frames is GodotMcpCommandError:
				return frames
			var was_held := _time.let_run()
			for frame in clampi(frames, 0, MAXIMUM_FRAMES):
				await tree.process_frame
			_time.hold_again_if(was_held)
			return {"frames": clampi(frames, 0, MAXIMUM_FRAMES), "waited_ms": Time.get_ticks_msec() - started_msec}
		"physics_frames":
			var physics_frames: Variant = GodotMcpParams.whole_number(params, "physics_frames", 0)
			if physics_frames is GodotMcpCommandError:
				return physics_frames
			var was_held := _time.let_run()
			for frame in clampi(physics_frames, 0, MAXIMUM_FRAMES):
				await _time.physics_frame_ended
			_time.hold_again_if(was_held)
			return {"physics_frames": clampi(physics_frames, 0, MAXIMUM_FRAMES), "waited_ms": Time.get_ticks_msec() - started_msec}
		"ms":
			var milliseconds: Variant = GodotMcpParams.whole_number(params, "ms", 0)
			if milliseconds is GodotMcpCommandError:
				return milliseconds
			var deadline_msec := started_msec + clampi(milliseconds, 0, MAXIMUM_TIMEOUT_MSEC)
			var was_held := _time.let_run()
			while Time.get_ticks_msec() < deadline_msec:
				await tree.process_frame
			_time.hold_again_if(was_held)
			return {"waited_ms": Time.get_ticks_msec() - started_msec}
	return await _wait_for_condition(params, started_msec)


func _wait_for_condition(params: Dictionary, started_msec: int) -> Variant:
	var condition: Variant = GodotMcpParams.required_text(params, "condition", "\"is_on_floor()\"")
	var node_path: Variant = GodotMcpParams.text(params, "node", ".")
	var timeout_msec: Variant = GodotMcpParams.whole_number(params, "timeout_ms", DEFAULT_TIMEOUT_MSEC)
	for value in [condition, node_path, timeout_msec]:
		if value is GodotMcpCommandError:
			return value
	var node: Variant = _scene.resolve(node_path)
	if node is GodotMcpCommandError:
		return node
	var expression := Expression.new()
	if expression.parse(condition) != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The condition \"%s\" does not parse: %s" % [condition, expression.get_error_text()], _condition_hint())
	var physics_frames := 0
	var value: Variant = null
	var was_held := _time.let_run()
	while true:
		value = expression.execute([], node, false)
		if expression.has_execute_failed():
			_time.hold_again_if(was_held)
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The condition \"%s\" failed: %s" % [condition, expression.get_error_text()], _condition_hint())
		if value or Time.get_ticks_msec() - started_msec >= clampi(timeout_msec, 0, MAXIMUM_TIMEOUT_MSEC):
			break
		await _time.physics_frame_ended
		physics_frames += 1
	_time.hold_again_if(was_held)
	return {"met": true if value else false, "value": _codec.encode(value), "physics_frames": physics_frames, "waited_ms": Time.get_ticks_msec() - started_msec}


static func _condition_hint() -> String:
	return "Conditions are Godot expressions evaluated on the node, such as \"is_on_floor()\" or \"position.y < 0.1\"."
