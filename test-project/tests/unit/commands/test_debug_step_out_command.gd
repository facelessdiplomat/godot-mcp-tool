extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpDebugStepOutCommand := preload("res://addons/godot_mcp_tool/commands/game/debug_step_out_command.gd")
const GodotMcpGameChannel := preload("res://addons/godot_mcp_tool/runtime/game_channel.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


func _channel_that(reaches_the_game: bool, commands: Array) -> GodotMcpGameChannel:
	return GodotMcpGameChannel.new(func(_payload: Dictionary) -> bool: return reaches_the_game, func(command: String) -> bool:
		commands.append(command)
		return reaches_the_game)


func test_tells_the_stopped_game_to_finish_its_function() -> void:
	var commands: Array = []
	var result: Dictionary = await GodotMcpDebugStepOutCommand.new(_channel_that(true, commands)).execute({})
	assert_eq(result, {"sent": true})
	assert_eq(commands, ["out"])


func test_reports_a_game_that_is_not_running() -> void:
	var error: GodotMcpCommandError = await GodotMcpDebugStepOutCommand.new(_channel_that(false, [])).execute({})
	assert_eq(error.code, GodotMcpJsonRpc.GAME_NOT_RUNNING)
