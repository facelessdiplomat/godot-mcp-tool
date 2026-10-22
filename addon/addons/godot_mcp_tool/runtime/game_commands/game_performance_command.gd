extends "../../commands/command.gd"

const GameScene := preload("game_scene.gd")
const Params := preload("../../commands/params.gd")

const DEFAULT_FRAMES := 60
const MAXIMUM_FRAMES := 600
const MILLISECONDS_PER_SECOND := 1000.0
const MICROSECONDS_PER_MILLISECOND := 1000.0
const HIGH_PERCENTILE := 0.95

var _scene: GameScene


func _init(scene: GameScene) -> void:
	_scene = scene


func execute(params: Dictionary) -> Variant:
	var frames: Variant = Params.whole_number(params, "frames", DEFAULT_FRAMES)
	if frames is CommandError:
		return frames
	if frames < 1 or frames > MAXIMUM_FRAMES:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"frames\" must be from 1 to %d" % MAXIMUM_FRAMES)
	var tree := Engine.get_main_loop() as SceneTree
	var frame_times: Array[float] = []
	var process_times: Array[float] = []
	var physics_times: Array[float] = []
	var draw_calls: Array[float] = []
	var primitives: Array[float] = []
	var drawn_objects: Array[float] = []
	await tree.process_frame
	var previous_usec := Time.get_ticks_usec()
	for frame in frames:
		await tree.process_frame
		var now_usec := Time.get_ticks_usec()
		frame_times.append((now_usec - previous_usec) / MICROSECONDS_PER_MILLISECOND)
		previous_usec = now_usec
		process_times.append(Performance.get_monitor(Performance.TIME_PROCESS) * MILLISECONDS_PER_SECOND)
		physics_times.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * MILLISECONDS_PER_SECOND)
		draw_calls.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		primitives.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		drawn_objects.append(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME))
	return {
		"scene": _scene.scene_path(),
		"frames": frames,
		"paused": tree.paused,
		"headless": DisplayServer.get_name() == "headless",
		"frame_ms": _summary(frame_times),
		"process_ms": _summary(process_times),
		"physics_ms": _summary(physics_times),
		"draw_calls": _summary(draw_calls),
		"primitives": _summary(primitives),
		"drawn_objects": _summary(drawn_objects),
		"memory_bytes": Performance.get_monitor(Performance.MEMORY_STATIC),
		"memory_peak_bytes": Performance.get_monitor(Performance.MEMORY_STATIC_MAX),
		"video_memory_bytes": Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED),
		"objects": Performance.get_monitor(Performance.OBJECT_COUNT),
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"orphan_nodes": Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),
		"resources": Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),
		"physics_3d_active_objects": Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS),
		"physics_3d_collision_pairs": Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS),
		"physics_3d_islands": Performance.get_monitor(Performance.PHYSICS_3D_ISLAND_COUNT),
	}


static func _summary(values: Array[float]) -> Dictionary:
	var sorted := values.duplicate()
	sorted.sort()
	var total := 0.0
	for value in values:
		total += value
	var high_index := mini(sorted.size() - 1, floori(sorted.size() * HIGH_PERCENTILE))
	return {"average": total / values.size(), "p95": sorted[high_index], "max": sorted[-1]}
