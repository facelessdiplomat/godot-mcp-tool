extends GutTest

const GodotMcpCommand := preload("res://addons/godot_mcp_tool/commands/command.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpCommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const GameCommandCatalog := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_command_catalog.gd")
const GodotMcpGameTime := preload("res://addons/godot_mcp_tool/runtime/game_time.gd")
const GodotMcpGameRequestResponder := preload("res://addons/godot_mcp_tool/runtime/game_request_responder.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


class EchoCommand:
	extends GodotMcpCommand

	func execute(params: Dictionary) -> Variant:
		await Engine.get_main_loop().process_frame
		return {"echo": params}


class MissingNodeCommand:
	extends GodotMcpCommand

	func execute(_params: Dictionary) -> Variant:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"Plyer\" not found", "Similar: Player.")


var _responder: GodotMcpGameRequestResponder


func before_each() -> void:
	var router := GodotMcpCommandRouter.new()
	router.register("echo", EchoCommand.new())
	router.register("missing", MissingNodeCommand.new())
	_responder = GodotMcpGameRequestResponder.new(router)


func test_answers_with_the_result_of_the_command() -> void:
	var answer: Dictionary = await _responder.respond({"id": 7, "method": "echo", "params": {"path": "."}})
	assert_eq(answer, {"id": 7, "result": {"echo": {"path": "."}}})


func test_answers_with_the_error_of_the_command() -> void:
	var answer: Dictionary = await _responder.respond({"id": 8, "method": "missing", "params": {}})
	assert_eq(answer, {"id": 8, "error": {"code": GodotMcpJsonRpc.NOT_FOUND, "message": "Node \"Plyer\" not found", "hint": "Similar: Player."}})


func test_answers_an_unknown_method_with_the_known_ones() -> void:
	var answer: Dictionary = await _responder.respond({"id": 9, "method": "fly", "params": {}})
	assert_eq((answer["error"] as Dictionary)["code"], GodotMcpJsonRpc.METHOD_NOT_FOUND)
	assert_string_contains((answer["error"] as Dictionary)["hint"], "echo")


func test_the_game_offers_its_inspection_commands() -> void:
	var time := GodotMcpGameTime.new()
	add_child_autoqfree(time)
	var router := GameCommandCatalog.build_router(func() -> Node: return null, time)
	assert_eq(router.methods(), PackedStringArray(["bounds", "eval", "input", "pause", "performance", "properties.get", "properties.set", "screenshot", "step", "tree", "wait"]))
