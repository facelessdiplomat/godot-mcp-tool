extends RefCounted

const BridgeConnection := preload("bridge_connection.gd")

var last_activity_msec := -1

var _tcp_server := TCPServer.new()
var _connections: Array[BridgeConnection] = []
var _create_session: Callable


func _init(create_session: Callable) -> void:
	_create_session = create_session


func listen(bind_address: String, port: int) -> Error:
	return _tcp_server.listen(port, bind_address)


func get_port() -> int:
	return _tcp_server.get_local_port()


func connection_count() -> int:
	return _connections.size()


func authenticated_count() -> int:
	return _connections.filter(func(connection: BridgeConnection) -> bool: return connection.session.is_authenticated).size()


func poll() -> void:
	while _tcp_server.is_connection_available():
		var peer := _tcp_server.take_connection()
		if peer != null:
			_connections.append(BridgeConnection.new(peer, _create_session.call()))
	for connection in _connections:
		if connection.poll() > 0:
			last_activity_msec = Time.get_ticks_msec()
	_connections = _connections.filter(func(connection: BridgeConnection) -> bool: return not connection.is_closed)


func broadcast(message: Dictionary) -> void:
	for connection in _connections:
		if connection.session.is_authenticated:
			connection.send(message)


func stop() -> void:
	for connection in _connections:
		connection.close()
	_connections.clear()
	_tcp_server.stop()
