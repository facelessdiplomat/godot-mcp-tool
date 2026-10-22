extends "../../commands/command.gd"

const Params := preload("../../commands/params.gd")

const MAXIMUM_PHYSICS_FRAMES := 3600


func execute(params: Dictionary) -> Variant:
	var physics_frames: Variant = Params.whole_number(params, "physics_frames", 1)
	if physics_frames is CommandError:
		return physics_frames
	if physics_frames < 1 or physics_frames > MAXIMUM_PHYSICS_FRAMES:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"physics_frames\" must be from 1 to %d" % MAXIMUM_PHYSICS_FRAMES)
	var tree := Engine.get_main_loop() as SceneTree
	var was_paused := tree.paused
	await tree.physics_frame
	var first_physics_frame := Engine.get_physics_frames()
	tree.paused = false
	for frame in physics_frames:
		await tree.physics_frame
	tree.paused = true
	return {
		"physics_frames": Engine.get_physics_frames() - first_physics_frame,
		"was_paused": was_paused,
		"physics_frame": Engine.get_physics_frames(),
	}
