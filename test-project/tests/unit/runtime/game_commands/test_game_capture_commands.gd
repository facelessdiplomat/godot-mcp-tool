extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpGameBoundsCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_bounds_command.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpGameScreenshotCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_screenshot_command.gd")
const GodotMcpGameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _arena: Node3D
var _scene: GodotMcpGameScene
var _time: GodotMcpGameTime
var _moments: CountingMoments


class CountingMoments:
	extends "res://addons/godot_mcp_tool/capture/moment_camera.gd"

	var grab_frames: Array = []
	var saved_labels := PackedStringArray()
	var time: Variant

	func _init() -> void:
		super(null)

	func grab() -> Variant:
		grab_frames.append(time.frames)
		return Image.create_empty(4, 4, false, Image.FORMAT_RGBA8)

	func save(_images: Array, labels: PackedStringArray, _options: Dictionary) -> Variant:
		saved_labels = labels
		return {"path": "/captures/moments-1-001.png", "width": 8, "height": 8, "original_width": 8, "original_height": 8, "moments": Array(labels)}


func before_each() -> void:
	_arena = Node3D.new()
	_arena.name = "Arena"
	var floor_box := CSGBox3D.new()
	floor_box.name = "Floor"
	floor_box.size = Vector3(20, 1, 20)
	floor_box.position = Vector3(0, -0.5, 0)
	_arena.add_child(floor_box)
	add_child_autofree(_arena)
	_scene = GodotMcpGameScene.new(func() -> Node: return _arena)


func test_measures_a_node_of_the_running_game() -> void:
	var result: Dictionary = await GodotMcpGameBoundsCommand.new(_scene, GodotMcpVariantCodec.new()).execute({"path": "Floor"})
	assert_eq(result["path"], "Floor")
	assert_eq(result["type"], "CSGBox3D")
	assert_eq(result["position"], "Vector3(-10, -1, -10)")
	assert_eq(result["size"], "Vector3(20, 1, 20)")
	assert_eq(result["center"], "Vector3(0, -0.5, 0)")
	assert_eq(result["visual_count"], 1)


func test_measures_several_nodes_of_the_running_game_at_once() -> void:
	var result: Dictionary = await GodotMcpGameBoundsCommand.new(_scene, GodotMcpVariantCodec.new()).execute({"paths": ["Floor", "Ceiling"]})
	var nodes: Array = result["nodes"]
	assert_eq((nodes[0] as Dictionary)["size"], "Vector3(20, 1, 20)")
	assert_eq((nodes[1] as Dictionary)["path"], "Ceiling")
	assert_true((nodes[1] as Dictionary).has("error"))


func test_measures_a_control_of_the_game_by_its_rectangle() -> void:
	var label := Label.new()
	label.name = "Score"
	label.position = Vector2(20, 10)
	label.size = Vector2(120, 30)
	_arena.add_child(label)
	var bounds: Dictionary = await GodotMcpGameBoundsCommand.new(_scene, GodotMcpVariantCodec.new()).execute({"path": "Score"})
	assert_eq(bounds["dimensions"], 2)
	assert_eq(bounds["size"], "Vector2(120, 30)")


func test_explains_a_node_that_is_neither_3d_nor_2d() -> void:
	var timer := Timer.new()
	timer.name = "Clock"
	_arena.add_child(timer)
	var error: Variant = await GodotMcpGameBoundsCommand.new(_scene, GodotMcpVariantCodec.new()).execute({"path": "Clock"})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Timer")


func test_refuses_screenshots_without_a_window() -> void:
	var error: Variant = await _screenshot_command().execute({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.OPERATION_FAILED)
	assert_string_contains((error as GodotMcpCommandError).message, "without a window")


func _screenshot_command() -> GodotMcpGameScreenshotCommand:
	if _time == null:
		_time = GodotMcpGameTime.new()
		add_child_autoqfree(_time)
	_moments = CountingMoments.new()
	_moments.time = _time
	return GodotMcpGameScreenshotCommand.new(_scene, "user://captures", _time, _moments)


func test_takes_a_strip_of_frames_a_given_number_of_physics_frames_apart() -> void:
	var result: Dictionary = await _screenshot_command().execute({"frames": 3, "every_physics_frames": 4})
	assert_eq(_moments.grab_frames.size(), 3)
	assert_eq(_moments.grab_frames[1] - _moments.grab_frames[0], 4)
	assert_eq(_moments.grab_frames[2] - _moments.grab_frames[1], 4)
	assert_eq(_moments.saved_labels, PackedStringArray(["frame 0", "frame 4", "frame 8"]))
	assert_eq(result["moments"], ["frame 0", "frame 4", "frame 8"])
	assert_eq(result["views"], [])


func test_refuses_a_strip_combined_with_views() -> void:
	var error: Variant = await _screenshot_command().execute({"frames": 3, "views": ["front"]})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_refuses_a_strip_of_more_frames_than_one_image_holds() -> void:
	var error: Variant = await _screenshot_command().execute({"frames": 7})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "6")
