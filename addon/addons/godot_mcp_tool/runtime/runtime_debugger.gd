extends EditorDebuggerPlugin

const GodotMcpGameChannel := preload("game_channel.gd")
const GodotMcpGameState := preload("game_state.gd")
const GodotMcpLogStore := preload("log_store.gd")
const GodotMcpRuntimeProtocol := preload("runtime_protocol.gd")

const GAME_SOURCE := "game"

var channel: GodotMcpGameChannel

var _game: GodotMcpGameState
var _log_store: GodotMcpLogStore
var _active_session_id := -1


func _init(game: GodotMcpGameState, log_store: GodotMcpLogStore) -> void:
	_game = game
	_log_store = log_store
	channel = GodotMcpGameChannel.new(_send_request)


func _has_capture(capture: String) -> bool:
	return capture == GodotMcpRuntimeProtocol.CAPTURE


func _capture(message: String, data: Array, _session_id: int) -> bool:
	var payload: Variant = data[0] if not data.is_empty() else null
	match message:
		GodotMcpRuntimeProtocol.LOG_MESSAGE:
			for entry in payload if payload is Array else []:
				if entry is Dictionary:
					_log_store.append(entry, GAME_SOURCE)
			return true
		GodotMcpRuntimeProtocol.READY_MESSAGE:
			_game.mark_ready(str((payload as Dictionary).get("scene", "")) if payload is Dictionary else "")
			return true
		GodotMcpRuntimeProtocol.RESPONSE_MESSAGE:
			channel.receive(payload)
			return true
	return false


func _setup_session(session_id: int) -> void:
	var session := get_session(session_id)
	session.started.connect(func() -> void:
		_active_session_id = session_id
		_game.mark_started(_log_store.last_seq + 1))
	session.stopped.connect(func() -> void:
		_game.mark_stopped()
		channel.cancel_all("The game stopped before it answered."))
	session.breaked.connect(func(_can_debug: bool) -> void:
		_game.mark_paused()
		channel.end_frame_waits())
	session.continued.connect(_game.mark_resumed)


func _send_request(payload: Dictionary) -> bool:
	if _active_session_id < 0:
		return false
	var session := get_session(_active_session_id)
	if session == null or not session.is_active():
		return false
	session.send_message(GodotMcpRuntimeProtocol.REQUEST_MESSAGE, [payload])
	return true
