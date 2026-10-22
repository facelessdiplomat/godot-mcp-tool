extends "../../commands/command.gd"

const Params := preload("../../commands/params.gd")


func execute(params: Dictionary) -> Variant:
	var paused: Variant = Params.flag(params, "paused", true)
	if paused is CommandError:
		return paused
	var tree := Engine.get_main_loop() as SceneTree
	var was_paused := tree.paused
	tree.paused = paused
	return {"paused": tree.paused, "was_paused": was_paused, "physics_frame": Engine.get_physics_frames()}
