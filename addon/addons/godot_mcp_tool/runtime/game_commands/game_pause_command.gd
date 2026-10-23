extends "../../commands/command.gd"

const GameTime := preload("../game_time.gd")
const Params := preload("../../commands/params.gd")

var _time: GameTime


func _init(time: GameTime) -> void:
	_time = time


func execute(params: Dictionary) -> Variant:
	var paused: Variant = Params.flag(params, "paused", true)
	if paused is CommandError:
		return paused
	var tree := Engine.get_main_loop() as SceneTree
	var was_paused := tree.paused
	if paused:
		_time.hold()
	else:
		_time.resume()
	return {"paused": tree.paused, "was_paused": was_paused, "game_frame": _time.frames}
