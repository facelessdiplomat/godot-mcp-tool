extends GutTest

const Authenticator := preload("res://addons/godot_mcp_tool/bridge/authenticator.gd")
const BridgeServer := preload("res://addons/godot_mcp_tool/bridge/bridge_server.gd")
const BridgeSession := preload("res://addons/godot_mcp_tool/bridge/bridge_session.gd")
const CommandRouter := preload("res://addons/godot_mcp_tool/commands/command_router.gd")
const PingCommand := preload("res://addons/godot_mcp_tool/commands/ping_command.gd")

const LOOPBACK_ADDRESS := "127.0.0.1"
const MAXIMUM_POLL_ATTEMPTS := 400
const RECEIVE_ONLY_POLL_ATTEMPTS := 100

var _server: BridgeServer
var _client: StreamPeerTCP


func before_each() -> void:
	var router := CommandRouter.new()
	router.register("ping", PingCommand.new())
	_server = BridgeServer.new(func() -> BridgeSession:
		return BridgeSession.new(Authenticator.new("secret", 1), router, func() -> Dictionary: return {"protocol": 1}))
	assert_eq(_server.listen(LOOPBACK_ADDRESS, 0), OK)
	_client = StreamPeerTCP.new()
	_client.connect_to_host(LOOPBACK_ADDRESS, _server.get_port())


func after_each() -> void:
	_client.disconnect_from_host()
	_server.stop()


func _send_and_receive_line(request_text: String) -> String:
	return "\n".join(_send_and_receive_lines(request_text, 1))


func _send_and_receive_lines(request_text: String, line_count: int) -> PackedStringArray:
	var request_sent := request_text.is_empty()
	var received := PackedByteArray()
	for attempt in RECEIVE_ONLY_POLL_ATTEMPTS if request_text.is_empty() else MAXIMUM_POLL_ATTEMPTS:
		_server.poll()
		_client.poll()
		if _client.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			if not request_sent:
				_client.put_data(request_text.to_utf8_buffer())
				request_sent = true
			var available_bytes := _client.get_available_bytes()
			if available_bytes > 0:
				received.append_array(_client.get_partial_data(available_bytes)[1])
			if received.count(10) >= line_count:
				break
		OS.delay_msec(5)
	return received.get_string_from_utf8().strip_edges().split("\n", false)


func _wait_until_client_is_disconnected() -> bool:
	for attempt in MAXIMUM_POLL_ATTEMPTS:
		_server.poll()
		_client.poll()
		if _client.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			return true
		OS.delay_msec(5)
	return false


func test_listens_on_an_ephemeral_port() -> void:
	assert_gt(_server.get_port(), 0)


func test_answers_hello_and_requests_over_tcp() -> void:
	var hello_text := _send_and_receive_line('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"secret","protocol":1}}\n')
	assert_eq_deep(JSON.parse_string(hello_text), {"jsonrpc": "2.0", "id": 1.0, "result": {"protocol": 1.0}})
	var ping_text := _send_and_receive_line('{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}\n')
	assert_eq_deep(JSON.parse_string(ping_text), {"jsonrpc": "2.0", "id": 2.0, "result": {"pong": true}})


func test_disconnects_a_client_that_does_not_speak_json() -> void:
	var response_text := _send_and_receive_line("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
	assert_eq(((JSON.parse_string(response_text) as Dictionary)["error"] as Dictionary)["code"], -32700.0)
	assert_true(_wait_until_client_is_disconnected())
	assert_eq(_server.connection_count(), 0)


func test_stop_closes_open_connections() -> void:
	_send_and_receive_line('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"secret","protocol":1}}\n')
	_server.stop()
	assert_true(_wait_until_client_is_disconnected())


func test_records_the_time_of_the_last_request() -> void:
	assert_eq(_server.last_activity_msec, -1)
	_send_and_receive_line('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"secret","protocol":1}}\n')
	assert_gte(_server.last_activity_msec, 0)


func test_broadcasts_notifications_to_authenticated_clients() -> void:
	_send_and_receive_line('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"secret","protocol":1}}\n')
	_server.broadcast({"jsonrpc": "2.0", "method": "log", "params": {"message": "ready"}})
	var notification_text := _send_and_receive_line("")
	assert_eq_deep(JSON.parse_string(notification_text), {"jsonrpc": "2.0", "method": "log", "params": {"message": "ready"}})


func test_does_not_broadcast_to_clients_that_did_not_authenticate() -> void:
	for attempt in 50:
		_server.poll()
		_client.poll()
		OS.delay_msec(2)
	_server.broadcast({"jsonrpc": "2.0", "method": "log", "params": {}})
	assert_eq(_send_and_receive_line(""), "")


func test_sends_status_notifications_before_the_answer() -> void:
	var router := CommandRouter.new()
	_server.stop()
	_server = BridgeServer.new(func() -> BridgeSession:
		return BridgeSession.new(Authenticator.new("secret", 1), router, func() -> Dictionary: return {"protocol": 1}, func() -> Dictionary: return {"errors": 0}))
	assert_eq(_server.listen(LOOPBACK_ADDRESS, 0), OK)
	_client = StreamPeerTCP.new()
	_client.connect_to_host(LOOPBACK_ADDRESS, _server.get_port())
	var lines := _send_and_receive_lines('{"jsonrpc":"2.0","id":1,"method":"hello","params":{"token":"secret","protocol":1}}\n', 2)
	assert_eq(lines.size(), 2)
	assert_eq((JSON.parse_string(lines[0]) as Dictionary)["method"], "log.status")
	assert_eq((JSON.parse_string(lines[1]) as Dictionary)["id"], 1.0)

