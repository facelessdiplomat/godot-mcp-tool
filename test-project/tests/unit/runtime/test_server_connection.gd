extends GutTest

const Command := preload("res://addons/godot_mcp_tool/commands/command.gd")
const CommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const GameRequestResponder := preload("res://addons/godot_mcp_tool/runtime/game_request_responder.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NdjsonBuffer := preload("res://addons/godot_mcp_tool/bridge/ndjson_buffer.gd")
const ServerConnection := preload("res://addons/godot_mcp_tool/runtime/server_connection.gd")

const MAXIMUM_FRAMES := 300


class EchoCommand:
	extends Command

	func execute(params: Dictionary) -> Variant:
		return {"echoed": params}


var _server: TCPServer
var _connection: ServerConnection
var _received := NdjsonBuffer.new()


func before_each() -> void:
	_server = TCPServer.new()
	_server.listen(0, "127.0.0.1")
	_received = NdjsonBuffer.new()
	var router := CommandRouter.new()
	router.register("tree", EchoCommand.new())
	_connection = ServerConnection.new(_server.get_local_port(), "c2VjcmV0", GameRequestResponder.new(router))


func after_each() -> void:
	_connection.close()
	_server.stop()


func _accepted_peer() -> StreamPeerTCP:
	for frame in MAXIMUM_FRAMES:
		_connection.poll()
		if _server.is_connection_available():
			return _server.take_connection()
		await get_tree().process_frame
	return null


func _lines_from(peer: StreamPeerTCP, count: int) -> PackedStringArray:
	var lines := PackedStringArray()
	for frame in MAXIMUM_FRAMES:
		_connection.poll()
		peer.poll()
		var available := peer.get_available_bytes()
		if available > 0:
			_received.append(peer.get_data(available)[1])
		lines.append_array(_received.take_lines())
		if lines.size() >= count:
			return lines
		await get_tree().process_frame
	return lines


func test_reads_its_port_from_the_arguments_after_the_double_dash() -> void:
	assert_eq(ServerConnection.port_from_arguments(PackedStringArray(["--mcp-log-file=/tmp/log.ndjson", "--mcp-port=40123"])), 40123)
	assert_eq(ServerConnection.port_from_arguments(PackedStringArray(["--mcp-log-file=/tmp/log.ndjson"])), 0)


func test_presents_its_token_and_answers_the_requests_of_the_server() -> void:
	var peer := await _accepted_peer()
	assert_not_null(peer)
	var greeting := await _lines_from(peer, 1)
	assert_eq(JSON.parse_string(greeting[0]), {"token": "c2VjcmV0"})
	peer.put_data(JsonRpc.encode({"id": 1, "method": "tree", "params": {"path": "."}}))
	var answers := await _lines_from(peer, 1)
	assert_eq(JSON.parse_string(answers[0]), {"id": 1.0, "result": {"echoed": {"path": "."}}})


func test_answers_a_request_it_does_not_know_with_an_error() -> void:
	var peer := await _accepted_peer()
	await _lines_from(peer, 1)
	peer.put_data(JsonRpc.encode({"id": 2, "method": "fly", "params": {}}))
	var answers := await _lines_from(peer, 1)
	var answer: Dictionary = JSON.parse_string(answers[0])
	assert_eq(answer["id"], 2.0)
	assert_eq((answer["error"] as Dictionary)["code"], float(JsonRpc.METHOD_NOT_FOUND))


func test_knows_when_the_server_closed_the_connection() -> void:
	var peer := await _accepted_peer()
	await _lines_from(peer, 1)
	assert_true(_connection.is_open())
	peer.disconnect_from_host()
	for frame in MAXIMUM_FRAMES:
		_connection.poll()
		if not _connection.is_open():
			break
		await get_tree().process_frame
	assert_false(_connection.is_open())
