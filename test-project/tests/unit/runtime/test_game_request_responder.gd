extends GutTest

const Command := preload("res://addons/godot_mcp_tool/commands/command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const CommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const GameCommandCatalog := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_command_catalog.gd")
const GameRequestResponder := preload("res://addons/godot_mcp_tool/runtime/game_request_responder.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


class EchoCommand:
	extends Command

	func execute(params: Dictionary) -> Variant:
		await Engine.get_main_loop().process_frame
		return {"echo": params}


class MissingNodeCommand:
	extends Command

	func execute(_params: Dictionary) -> Variant:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"Plyer\" not found", "Similar: Player.")


var _responder: GameRequestResponder


func before_each() -> void:
	var router := CommandRouter.new()
	router.register("echo", EchoCommand.new())
	router.register("missing", MissingNodeCommand.new())
	_responder = GameRequestResponder.new(router)


func test_answers_with_the_result_of_the_command() -> void:
	var answer: Dictionary = await _responder.respond({"id": 7, "method": "echo", "params": {"path": "."}})
	assert_eq(answer, {"id": 7, "result": {"echo": {"path": "."}}})


func test_answers_with_the_error_of_the_command() -> void:
	var answer: Dictionary = await _responder.respond({"id": 8, "method": "missing", "params": {}})
	assert_eq(answer, {"id": 8, "error": {"code": JsonRpc.NOT_FOUND, "message": "Node \"Plyer\" not found", "hint": "Similar: Player."}})


func test_answers_an_unknown_method_with_the_known_ones() -> void:
	var answer: Dictionary = await _responder.respond({"id": 9, "method": "fly", "params": {}})
	assert_eq((answer["error"] as Dictionary)["code"], JsonRpc.METHOD_NOT_FOUND)
	assert_string_contains((answer["error"] as Dictionary)["hint"], "echo")


func test_the_game_offers_its_inspection_commands() -> void:
	var router := GameCommandCatalog.build_router(func() -> Node: return null)
	assert_eq(router.methods(), PackedStringArray(["properties.get", "properties.set", "tree", "wait"]))
