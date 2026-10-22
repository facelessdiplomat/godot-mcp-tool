extends RefCounted

const BridgeSession := preload("bridge_session.gd")
const JsonRpc := preload("json_rpc.gd")
const NdjsonBuffer := preload("ndjson_buffer.gd")

var is_closed := false
var session: BridgeSession

var _peer: StreamPeerTCP
var _incoming := NdjsonBuffer.new()
var _outgoing := PackedByteArray()


func _init(peer: StreamPeerTCP, bridge_session: BridgeSession) -> void:
	_peer = peer
	session = bridge_session
	_peer.set_no_delay(true)


func poll() -> int:
	if is_closed:
		return 0
	_peer.poll()
	var status := _peer.get_status()
	if status == StreamPeerTCP.STATUS_CONNECTING:
		return 0
	if status != StreamPeerTCP.STATUS_CONNECTED:
		close()
		return 0
	var received_lines := _receive()
	_send_pending()
	if session.should_close and _outgoing.is_empty():
		close()
	return received_lines


func send(message: Dictionary) -> void:
	if not is_closed:
		_outgoing.append_array(JsonRpc.encode(message))


func close() -> void:
	if is_closed:
		return
	is_closed = true
	_peer.disconnect_from_host()


func _receive() -> int:
	var available_bytes := _peer.get_available_bytes()
	if available_bytes <= 0:
		return 0
	var received: Array = _peer.get_partial_data(available_bytes)
	if received[0] != OK:
		close()
		return 0
	_incoming.append(received[1])
	if _incoming.is_overflowing():
		close()
		return 0
	var lines := _incoming.take_lines()
	for line in lines:
		_answer(line)
		if session.should_close:
			break
	return lines.size()


func _answer(line: String) -> void:
	var response: Dictionary = await session.handle_line(line)
	for notification in session.take_notifications():
		send(notification)
	send(response)


func _send_pending() -> void:
	if is_closed or _outgoing.is_empty():
		return
	var sent: Array = _peer.put_partial_data(_outgoing)
	if sent[0] != OK:
		close()
		return
	_outgoing = _outgoing.slice(sent[1])
