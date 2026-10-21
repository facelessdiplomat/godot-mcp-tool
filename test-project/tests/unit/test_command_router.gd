extends GutTest

const CommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const PingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")


func test_finds_a_registered_command() -> void:
	var router := CommandRouter.new()
	var ping := PingCommand.new()
	router.register("ping", ping)
	assert_eq(router.find("ping"), ping)


func test_returns_null_for_an_unknown_method() -> void:
	assert_null(CommandRouter.new().find("missing"))


func test_lists_methods_in_alphabetical_order() -> void:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	router.register("echo", PingCommand.new())
	assert_eq(router.methods(), PackedStringArray(["echo", "ping"]))


func test_ping_answers_with_pong() -> void:
	assert_eq_deep(PingCommand.new().execute({}), {"pong": true})
