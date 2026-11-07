extends GutTest

const GodotMcpCaptureParams := preload("res://addons/godot_mcp_tool/capture/capture_params.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


func test_uses_defaults() -> void:
	var options: Dictionary = GodotMcpCaptureParams.read({})
	assert_eq(options["max_size"], GodotMcpCaptureParams.DEFAULT_MAX_SIZE)
	assert_eq(options["format"], "png")
	assert_eq(options["views"], [])


func test_reads_the_options() -> void:
	var options: Dictionary = GodotMcpCaptureParams.read({"max_size": 640.0, "format": "jpeg", "views": ["iso"]})
	assert_eq(options["max_size"], 640)
	assert_eq(options["format"], "jpeg")
	assert_eq(options["views"], ["iso"])


func test_rejects_an_unknown_format() -> void:
	var error: Variant = GodotMcpCaptureParams.read({"format": "gif"})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains((error as GodotMcpCommandError).message, "png or jpeg")


func test_rejects_a_size_out_of_range() -> void:
	var error: Variant = GodotMcpCaptureParams.read({"max_size": 10})
	assert_true(error is GodotMcpCommandError)
	assert_string_contains((error as GodotMcpCommandError).message, "max_size")


func test_rejects_views_that_are_not_a_list() -> void:
	assert_true(GodotMcpCaptureParams.read({"views": "iso"}) is GodotMcpCommandError)
