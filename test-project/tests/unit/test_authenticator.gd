extends GutTest

const Authenticator := preload("res://addons/godot_mcp_tool/bridge/authenticator.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")


func test_accepts_the_expected_token_and_protocol() -> void:
	var authenticator := Authenticator.new("secret", 1)
	assert_null(authenticator.verify({"token": "secret", "protocol": 1}))


func test_accepts_a_protocol_number_parsed_as_float() -> void:
	var authenticator := Authenticator.new("secret", 1)
	assert_null(authenticator.verify({"token": "secret", "protocol": 1.0}))


func test_rejects_a_wrong_token() -> void:
	var rejection := Authenticator.new("secret", 1).verify({"token": "guess", "protocol": 1})
	assert_not_null(rejection)
	assert_eq(rejection.code, JsonRpc.UNAUTHORIZED)


func test_rejects_a_missing_token() -> void:
	var rejection := Authenticator.new("secret", 1).verify({"protocol": 1})
	assert_eq(rejection.code, JsonRpc.UNAUTHORIZED)


func test_rejects_another_protocol_version() -> void:
	var rejection := Authenticator.new("secret", 1).verify({"token": "secret", "protocol": 2})
	assert_eq(rejection.code, JsonRpc.PROTOCOL_MISMATCH)
	assert_string_contains(rejection.hint, "matching versions")
