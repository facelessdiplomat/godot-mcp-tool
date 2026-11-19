extends GutTest

const GodotMcpCommand := preload("res://addons/godot_mcp_tool/commands/command.gd")
const GodotMcpCommandCatalog := preload("res://addons/godot_mcp_tool/commands/command_catalog.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpCommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const GodotMcpHeldCommand := preload("res://addons/godot_mcp_tool/commands/held_command.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")


class CountingCommand:
	extends "res://addons/godot_mcp_tool/commands/command.gd"

	var runs := 0

	func execute(_params: Dictionary) -> Variant:
		runs += 1
		return {"done": true}


var _held := false


func _is_held() -> bool:
	return _held


func test_refuses_a_command_while_changes_are_held_and_names_the_switch() -> void:
	var inner := CountingCommand.new()
	_held = true
	var refused: Variant = await GodotMcpHeldCommand.new(inner, _is_held).execute({})
	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.CHANGES_HELD)
	assert_eq((refused as GodotMcpCommandError).message, "Changes are held in the editor, so this was not done")
	assert_string_contains((refused as GodotMcpCommandError).hint, "Project → Tools → Godot MCP Tool → Hold Changes")
	assert_string_contains((refused as GodotMcpCommandError).hint, "reading")
	assert_eq(inner.runs, 0)


func test_runs_the_command_once_changes_are_no_longer_held() -> void:
	var inner := CountingCommand.new()
	_held = false
	assert_eq(await GodotMcpHeldCommand.new(inner, _is_held).execute({}), {"done": true})
	assert_eq(inner.runs, 1)


func test_wraps_the_commands_that_change_the_project_or_start_the_game_and_no_others() -> void:
	var router := GodotMcpCommandRouter.new()
	for method in ["scene.batch_edit", "game.run", "game.stop", "scene.get_tree", "node.set_properties"]:
		router.register(method, CountingCommand.new())
	GodotMcpCommandCatalog.hold_changes_of(router, _is_held)
	assert_true(router.find("scene.batch_edit") is GodotMcpHeldCommand)
	assert_true(router.find("game.run") is GodotMcpHeldCommand)
	assert_true(router.find("node.set_properties") is GodotMcpHeldCommand)
	assert_false(router.find("game.stop") is GodotMcpHeldCommand)
	assert_false(router.find("scene.get_tree") is GodotMcpHeldCommand)


func test_holds_no_method_that_reads_or_stops() -> void:
	for method: String in GodotMcpCommandCatalog.METHODS_THAT_CHANGE:
		assert_false(method.ends_with("get_tree") or method.ends_with(".get") or method == "game.stop" or method == "ping", method)


func test_tells_through_ping_whether_changes_are_held() -> void:
	_held = true
	assert_eq(GodotMcpPingCommand.new(_is_held).execute({}), {"pong": true, "changes_held": true})
	_held = false
	assert_eq(GodotMcpPingCommand.new(_is_held).execute({}), {"pong": true, "changes_held": false})
