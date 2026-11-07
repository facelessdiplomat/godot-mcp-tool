extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpGameBoundsCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_bounds_command.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpGameScreenshotCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_screenshot_command.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _arena: Node3D
var _scene: GodotMcpGameScene


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


func test_explains_a_node_that_is_not_3d() -> void:
	var label := Label.new()
	label.name = "Score"
	_arena.add_child(label)
	var error: Variant = await GodotMcpGameBoundsCommand.new(_scene, GodotMcpVariantCodec.new()).execute({"path": "Score"})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "Label")


func test_refuses_screenshots_without_a_window() -> void:
	var error: Variant = await GodotMcpGameScreenshotCommand.new(_scene, "user://captures").execute({})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.OPERATION_FAILED)
	assert_string_contains((error as GodotMcpCommandError).message, "without a window")
