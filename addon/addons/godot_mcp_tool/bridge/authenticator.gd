extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("json_rpc.gd")

var _expected_token: String
var _protocol: int


func _init(expected_token: String, protocol: int) -> void:
	_expected_token = expected_token
	_protocol = protocol


func verify(params: Dictionary) -> CommandError:
	var token: Variant = params.get("token")
	if not token is String or not _tokens_match(token, _expected_token):
		return CommandError.new(
			JsonRpc.UNAUTHORIZED,
			"Invalid token",
			"Restart the MCP server so it reads the current discovery file of this editor.")
	var protocol: Variant = params.get("protocol")
	if not (protocol is int or protocol is float) or int(protocol) != _protocol:
		return CommandError.new(
			JsonRpc.PROTOCOL_MISMATCH,
			"Unsupported bridge protocol %s; this addon speaks protocol %d" % [str(protocol), _protocol],
			"Install matching versions of the MCP server and the Godot addon.")
	return null


static func _tokens_match(received_token: String, expected_token: String) -> bool:
	var received_bytes := received_token.to_utf8_buffer()
	var expected_bytes := expected_token.to_utf8_buffer()
	if received_bytes.size() != expected_bytes.size():
		return false
	var difference := 0
	for byte_index in expected_bytes.size():
		difference |= received_bytes[byte_index] ^ expected_bytes[byte_index]
	return difference == 0
