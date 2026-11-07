extends GutTest

const GodotMcpCommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const GodotMcpPingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")


func test_finds_a_registered_command() -> void:
	var router := GodotMcpCommandRouter.new()
	var ping := GodotMcpPingCommand.new()
	router.register("ping", ping)
	assert_eq(router.find("ping"), ping)


func test_returns_null_for_an_unknown_method() -> void:
	assert_null(GodotMcpCommandRouter.new().find("missing"))


func test_lists_methods_in_alphabetical_order() -> void:
	var router := GodotMcpCommandRouter.new()
	router.register("ping", GodotMcpPingCommand.new())
	router.register("echo", GodotMcpPingCommand.new())
	assert_eq(router.methods(), PackedStringArray(["echo", "ping"]))


func test_ping_answers_with_pong() -> void:
	assert_eq_deep(GodotMcpPingCommand.new().execute({}), {"pong": true})
