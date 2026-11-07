extends "../../commands/command.gd"

const GodotMcpGameTime := preload("../game_time.gd")
const GodotMcpParams := preload("../../commands/params.gd")

var _time: GodotMcpGameTime


func _init(time: GodotMcpGameTime) -> void:
	_time = time


func execute(params: Dictionary) -> Variant:
	var paused: Variant = GodotMcpParams.flag(params, "paused", true)
	if paused is GodotMcpCommandError:
		return paused
	var tree := Engine.get_main_loop() as SceneTree
	var was_paused := tree.paused
	if paused:
		_time.hold()
	else:
		_time.resume()
	return {"paused": tree.paused, "was_paused": was_paused, "game_frame": _time.frames}
