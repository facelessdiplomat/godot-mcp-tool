extends RefCounted

const AddonInfo := preload("../addon_info.gd")

const TIMEOUT_MSEC := 1000
const POLL_INTERVAL_MSEC := 5


static func is_listening(port: int) -> bool:
	var connection := StreamPeerTCP.new()
	if connection.connect_to_host(AddonInfo.LOOPBACK_ADDRESS, port) != OK:
		return false
	_poll_until_connected_or_refused(connection)
	var listening := _stays_connected(connection)
	connection.disconnect_from_host()
	return listening


static func _poll_until_connected_or_refused(connection: StreamPeerTCP) -> void:
	var deadline := Time.get_ticks_msec() + TIMEOUT_MSEC
	while connection.get_status() == StreamPeerTCP.STATUS_CONNECTING and Time.get_ticks_msec() < deadline:
		OS.delay_msec(POLL_INTERVAL_MSEC)
		connection.poll()


static func _stays_connected(connection: StreamPeerTCP) -> bool:
	OS.delay_msec(POLL_INTERVAL_MSEC)
	connection.poll()
	return connection.get_status() == StreamPeerTCP.STATUS_CONNECTED
