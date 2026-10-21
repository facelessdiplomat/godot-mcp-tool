extends GutTest

const Authenticator := preload("res://addons/godot_mcp_tool/bridge/authenticator.gd")
const BridgeSession := preload("res://addons/godot_mcp_tool/bridge/bridge_session.gd")
const Command := preload("res://addons/godot_mcp_tool/commands/command.gd")
const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const CommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")


class FailingCommand:
	extends Command

	func execute(_params: Dictionary) -> Variant:
		return CommandError.new(-32004, "Node not found", "Similar: Player/MeshInstance3D")


var _session: BridgeSession


func before_each() -> void:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	router.register("fail", FailingCommand.new())
	_session = BridgeSession.new(Authenticator.new("secret", 1), router, func() -> Dictionary: return {"protocol": 1, "addon_version": "0.1.0"})


func _hello_line(token: String) -> String:
	return JSON.stringify({"jsonrpc": "2.0", "id": 1, "method": "hello", "params": {"token": token, "protocol": 1}})


func _request_line(request_id: int, method: String) -> String:
	return JSON.stringify({"jsonrpc": "2.0", "id": request_id, "method": method, "params": {}})


func test_rejects_text_that_is_not_json_and_closes() -> void:
	var response := _session.handle_line("GET / HTTP/1.1")
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.PARSE_ERROR)
	assert_true(_session.should_close)


func test_requires_hello_before_other_methods() -> void:
	var response := _session.handle_line(_request_line(1, "ping"))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.UNAUTHORIZED)
	assert_true(_session.should_close)


func test_rejects_a_wrong_token_and_closes() -> void:
	var response := _session.handle_line(_hello_line("guess"))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.UNAUTHORIZED)
	assert_false(_session.is_authenticated)
	assert_true(_session.should_close)


func test_answers_hello_with_the_editor_information() -> void:
	var response := _session.handle_line(_hello_line("secret"))
	assert_eq_deep(response, {"jsonrpc": "2.0", "id": 1, "result": {"protocol": 1, "addon_version": "0.1.0"}})
	assert_true(_session.is_authenticated)
	assert_false(_session.should_close)


func test_routes_requests_after_hello() -> void:
	_session.handle_line(_hello_line("secret"))
	var response := _session.handle_line(_request_line(2, "ping"))
	assert_eq_deep(response, {"jsonrpc": "2.0", "id": 2, "result": {"pong": true}})


func test_reports_an_unknown_method_with_the_available_ones() -> void:
	_session.handle_line(_hello_line("secret"))
	var error := _session.handle_line(_request_line(3, "teleport"))["error"] as Dictionary
	assert_eq(error["code"], JsonRpc.METHOD_NOT_FOUND)
	assert_string_contains((error["data"] as Dictionary)["hint"], "ping")


func test_reports_a_command_error_with_its_hint() -> void:
	_session.handle_line(_hello_line("secret"))
	var error := _session.handle_line(_request_line(4, "fail"))["error"] as Dictionary
	assert_eq_deep(error, {"code": -32004, "message": "Node not found", "data": {"hint": "Similar: Player/MeshInstance3D"}})


func test_rejects_params_that_are_not_an_object() -> void:
	_session.handle_line(_hello_line("secret"))
	var response := _session.handle_line(JSON.stringify({"jsonrpc": "2.0", "id": 5, "method": "ping", "params": [1, 2]}))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.INVALID_PARAMS)
