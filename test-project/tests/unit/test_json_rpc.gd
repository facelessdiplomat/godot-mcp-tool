extends GutTest

const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


func test_builds_a_success_response() -> void:
	assert_eq_deep(JsonRpc.success(7, {"pong": true}), {"jsonrpc": "2.0", "id": 7, "result": {"pong": true}})


func test_builds_a_failure_with_a_hint() -> void:
	var failure := JsonRpc.failure(7, JsonRpc.METHOD_NOT_FOUND, "Unknown method", "Available methods: ping")
	assert_eq_deep(failure, {
		"jsonrpc": "2.0",
		"id": 7,
		"error": {"code": -32601, "message": "Unknown method", "data": {"hint": "Available methods: ping"}},
	})


func test_builds_a_failure_without_a_hint() -> void:
	var failure := JsonRpc.failure(null, JsonRpc.PARSE_ERROR, "Not JSON")
	assert_false((failure["error"] as Dictionary).has("data"))


func test_builds_a_notification() -> void:
	assert_eq_deep(JsonRpc.make_notification("log", {"message": "ready"}), {"jsonrpc": "2.0", "method": "log", "params": {"message": "ready"}})


func test_encodes_one_message_per_line() -> void:
	var encoded := JsonRpc.encode(JsonRpc.success(1, {"text": "line one\nline two"})).get_string_from_utf8()
	assert_true(encoded.ends_with("\n"))
	assert_eq(encoded.count("\n"), 1)
	assert_eq_deep(JSON.parse_string(encoded), {"jsonrpc": "2.0", "id": 1.0, "result": {"text": "line one\nline two"}})
