extends RefCounted

const GameRequestResponder := preload("game_request_responder.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const NdjsonBuffer := preload("../bridge/ndjson_buffer.gd")

const HOST := "127.0.0.1"
const PORT_ARGUMENT_PREFIX := "--mcp-port="
const TOKEN_VARIABLE := "GODOT_MCP_GAME_TOKEN"
const OPEN_STATUSES := [StreamPeerTCP.STATUS_CONNECTING, StreamPeerTCP.STATUS_CONNECTED]

var _peer := StreamPeerTCP.new()
var _token: String
var _responder: GameRequestResponder
var _received := NdjsonBuffer.new()
var _greeted := false


static func port_from_arguments(user_arguments: PackedStringArray) -> int:
	for argument in user_arguments:
		if argument.begins_with(PORT_ARGUMENT_PREFIX):
			return int(argument.trim_prefix(PORT_ARGUMENT_PREFIX))
	return 0


static func token_from_environment() -> String:
	return OS.get_environment(TOKEN_VARIABLE)


func _init(port: int, token: String, responder: GameRequestResponder) -> void:
	_token = token
	_responder = responder
	_peer.connect_to_host(HOST, port)


func is_open() -> bool:
	_peer.poll()
	return _peer.get_status() in OPEN_STATUSES


func poll() -> void:
	_peer.poll()
	if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	if not _greeted:
		_greeted = true
		_send({"token": _token})
	var available := _peer.get_available_bytes()
	if available > 0:
		var received: Array = _peer.get_data(available)
		if received[0] == OK:
			_received.append(received[1])
	for line in _received.take_lines():
		var request: Variant = JSON.parse_string(line)
		if request is Dictionary:
			_answer(request)


func close() -> void:
	_peer.disconnect_from_host()


func _answer(request: Dictionary) -> void:
	var answer := await _responder.respond(request)
	if _peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
		_send(answer)


func _send(message: Dictionary) -> void:
	_peer.put_data(JsonRpc.encode(message))
