extends RefCounted

const BridgeSession := preload("bridge_session.gd")
const JsonRpc := preload("json_rpc.gd")
const NdjsonBuffer := preload("ndjson_buffer.gd")

var is_closed := false

var _peer: StreamPeerTCP
var _session: BridgeSession
var _incoming := NdjsonBuffer.new()
var _outgoing := PackedByteArray()


func _init(peer: StreamPeerTCP, session: BridgeSession) -> void:
	_peer = peer
	_session = session
	_peer.set_no_delay(true)


func poll() -> void:
	if is_closed:
		return
	_peer.poll()
	var status := _peer.get_status()
	if status == StreamPeerTCP.STATUS_CONNECTING:
		return
	if status != StreamPeerTCP.STATUS_CONNECTED:
		close()
		return
	_receive()
	_send_pending()
	if _session.should_close and _outgoing.is_empty():
		close()


func send(message: Dictionary) -> void:
	_outgoing.append_array(JsonRpc.encode(message))


func close() -> void:
	if is_closed:
		return
	is_closed = true
	_peer.disconnect_from_host()


func _receive() -> void:
	var available_bytes := _peer.get_available_bytes()
	if available_bytes <= 0:
		return
	var received: Array = _peer.get_partial_data(available_bytes)
	if received[0] != OK:
		close()
		return
	_incoming.append(received[1])
	if _incoming.is_overflowing():
		close()
		return
	for line in _incoming.take_lines():
		send(_session.handle_line(line))
		if _session.should_close:
			return


func _send_pending() -> void:
	if is_closed or _outgoing.is_empty():
		return
	var sent: Array = _peer.put_partial_data(_outgoing)
	if sent[0] != OK:
		close()
		return
	_outgoing = _outgoing.slice(sent[1])
