extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GamePauseCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_pause_command.gd")
const GamePerformanceCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_performance_command.gd")
const GameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GameStepCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_step_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")

const TICK_COUNTER := """extends Node

var ticks := 0


func _physics_process(_delta: float) -> void:
	ticks += 1
"""

var _counter: Node


func before_each() -> void:
	var script := GDScript.new()
	script.source_code = TICK_COUNTER
	script.reload()
	_counter = Node.new()
	_counter.set_script(script)
	_counter.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child_autofree(_counter)


func after_each() -> void:
	get_tree().paused = false


func _ticks() -> int:
	return _counter.get("ticks")


func test_pauses_and_resumes_the_game() -> void:
	var paused: Dictionary = await GamePauseCommand.new().execute({})
	var ticks := _ticks()
	for frame in 5:
		await get_tree().physics_frame
	assert_eq(_ticks(), ticks)
	assert_true(paused["paused"])
	assert_false(paused["was_paused"])
	var resumed: Dictionary = await GamePauseCommand.new().execute({"paused": false})
	assert_false(resumed["paused"])
	assert_true(resumed["was_paused"])
	assert_false(get_tree().paused)


func test_steps_exactly_the_requested_physics_frames_and_stays_paused() -> void:
	await GamePauseCommand.new().execute({})
	var ticks := _ticks()
	var stepped: Dictionary = await GameStepCommand.new().execute({"physics_frames": 3})
	assert_eq(_ticks() - ticks, 3)
	assert_eq(stepped["physics_frames"], 3)
	assert_true(stepped["was_paused"])
	assert_true(get_tree().paused)
	for frame in 3:
		await get_tree().physics_frame
	assert_eq(_ticks() - ticks, 3)


func test_steps_one_physics_frame_by_default_and_pauses_a_running_game() -> void:
	var ticks := _ticks()
	var stepped: Dictionary = await GameStepCommand.new().execute({})
	assert_eq(_ticks() - ticks, 1)
	assert_false(stepped["was_paused"])
	assert_true(get_tree().paused)


func test_refuses_steps_out_of_range() -> void:
	var result: CommandError = await GameStepCommand.new().execute({"physics_frames": 0})
	assert_eq(result.code, JsonRpc.INVALID_PARAMS)


func test_measures_frames_and_counts_objects() -> void:
	var result: Dictionary = await GamePerformanceCommand.new(GameScene.new(func() -> Node: return _counter)).execute({"frames": 5})
	assert_eq(result["frames"], 5)
	assert_gt((result["frame_ms"] as Dictionary)["average"], 0.0)
	assert_gte((result["frame_ms"] as Dictionary)["max"], (result["frame_ms"] as Dictionary)["p95"])
	assert_gt(result["nodes"], 0)
	assert_gt(result["memory_bytes"], 0)
	assert_true(result.has("orphan_nodes"))
	assert_true(result.has("draw_calls"))
