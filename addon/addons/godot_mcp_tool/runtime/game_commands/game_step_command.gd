extends "../../commands/command.gd"

const GodotMcpGameTime := preload("../game_time.gd")
const GodotMcpParams := preload("../../commands/params.gd")

const MAXIMUM_PHYSICS_FRAMES := 3600

var _time: GodotMcpGameTime


func _init(time: GodotMcpGameTime) -> void:
	_time = time


func execute(params: Dictionary) -> Variant:
	var physics_frames: Variant = GodotMcpParams.whole_number(params, "physics_frames", 1)
	if physics_frames is GodotMcpCommandError:
		return physics_frames
	if physics_frames < 1 or physics_frames > MAXIMUM_PHYSICS_FRAMES:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"physics_frames\" must be from 1 to %d" % MAXIMUM_PHYSICS_FRAMES)
	var was_paused := (Engine.get_main_loop() as SceneTree).paused
	var first_frame := _time.frames
	_time.hold()
	var was_held := _time.let_run()
	for frame in physics_frames:
		await _time.physics_frame_ended
	_time.hold_again_if(was_held)
	return {"physics_frames": _time.frames - first_frame, "was_paused": was_paused, "game_frame": _time.frames}
