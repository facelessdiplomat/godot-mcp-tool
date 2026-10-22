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


class FrameWaitingCommand:
	extends Command

	func execute(_params: Dictionary) -> Variant:
		await Engine.get_main_loop().process_frame
		return {"waited": true}


var _session: BridgeSession


func before_each() -> void:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	router.register("fail", FailingCommand.new())
	router.register("wait", FrameWaitingCommand.new())
	_session = BridgeSession.new(Authenticator.new("secret", 1), router, func() -> Dictionary: return {"protocol": 1, "addon_version": "0.1.0"})


func _hello_line(token: String) -> String:
	return JSON.stringify({"jsonrpc": "2.0", "id": 1, "method": "hello", "params": {"token": token, "protocol": 1}})


func _request_line(request_id: int, method: String) -> String:
	return JSON.stringify({"jsonrpc": "2.0", "id": request_id, "method": method, "params": {}})


func test_rejects_text_that_is_not_json_and_closes() -> void:
	var response: Dictionary = await _session.handle_line("GET / HTTP/1.1")
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.PARSE_ERROR)
	assert_true(_session.should_close)


func test_requires_hello_before_other_methods() -> void:
	var response: Dictionary = await _session.handle_line(_request_line(1, "ping"))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.UNAUTHORIZED)
	assert_true(_session.should_close)


func test_rejects_a_wrong_token_and_closes() -> void:
	var response: Dictionary = await _session.handle_line(_hello_line("guess"))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.UNAUTHORIZED)
	assert_false(_session.is_authenticated)
	assert_true(_session.should_close)


func test_answers_hello_with_the_editor_information() -> void:
	var response: Dictionary = await _session.handle_line(_hello_line("secret"))
	assert_eq_deep(response, {"jsonrpc": "2.0", "id": 1, "result": {"protocol": 1, "addon_version": "0.1.0"}})
	assert_true(_session.is_authenticated)
	assert_false(_session.should_close)


func test_routes_requests_after_hello() -> void:
	await _session.handle_line(_hello_line("secret"))
	var response: Dictionary = await _session.handle_line(_request_line(2, "ping"))
	assert_eq_deep(response, {"jsonrpc": "2.0", "id": 2, "result": {"pong": true}})


func test_answers_an_asynchronous_command_when_it_finishes() -> void:
	await _session.handle_line(_hello_line("secret"))
	var response: Dictionary = await _session.handle_line(_request_line(3, "wait"))
	assert_eq_deep(response, {"jsonrpc": "2.0", "id": 3, "result": {"waited": true}})


func test_reports_an_unknown_method_with_the_available_ones() -> void:
	await _session.handle_line(_hello_line("secret"))
	var response: Dictionary = await _session.handle_line(_request_line(4, "teleport"))
	var error := response["error"] as Dictionary
	assert_eq(error["code"], JsonRpc.METHOD_NOT_FOUND)
	assert_string_contains((error["data"] as Dictionary)["hint"], "ping")


func test_reports_a_command_error_with_its_hint() -> void:
	await _session.handle_line(_hello_line("secret"))
	var response: Dictionary = await _session.handle_line(_request_line(5, "fail"))
	assert_eq_deep(response["error"], {"code": -32004, "message": "Node not found", "data": {"hint": "Similar: Player/MeshInstance3D"}})


func test_rejects_params_that_are_not_an_object() -> void:
	await _session.handle_line(_hello_line("secret"))
	var response: Dictionary = await _session.handle_line(JSON.stringify({"jsonrpc": "2.0", "id": 6, "method": "ping", "params": [1, 2]}))
	assert_eq((response["error"] as Dictionary)["code"], JsonRpc.INVALID_PARAMS)


func _session_reporting(status: Dictionary) -> BridgeSession:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	return BridgeSession.new(Authenticator.new("secret", 1), router, func() -> Dictionary: return {"protocol": 1}, func() -> Dictionary: return status.duplicate())


func test_sends_the_log_status_along_with_the_hello_answer() -> void:
	var session := _session_reporting({"last_seq": 3, "errors": 1})
	await session.handle_line(_hello_line("secret"))
	var notifications := session.take_notifications()
	assert_eq(notifications.size(), 1)
	assert_eq((notifications[0] as Dictionary)["method"], "log.status")
	assert_eq((notifications[0] as Dictionary)["params"], {"last_seq": 3, "errors": 1})


func test_sends_the_log_status_again_only_after_it_changes() -> void:
	var status := {"last_seq": 3, "errors": 1}
	var session := _session_reporting(status)
	await session.handle_line(_hello_line("secret"))
	session.take_notifications()
	await session.handle_line(_request_line(2, "ping"))
	assert_eq(session.take_notifications(), [])
	status["errors"] = 2
	await session.handle_line(_request_line(3, "ping"))
	assert_eq(session.take_notifications().size(), 1)


func test_sends_no_status_before_authentication() -> void:
	var session := _session_reporting({"last_seq": 3})
	await session.handle_line(_request_line(1, "ping"))
	assert_eq(session.take_notifications(), [])

