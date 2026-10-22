extends EditorDebuggerPlugin

const GameChannel := preload("game_channel.gd")
const GameState := preload("game_state.gd")
const LogStore := preload("log_store.gd")
const RuntimeProtocol := preload("runtime_protocol.gd")

const GAME_SOURCE := "game"

var channel: GameChannel

var _game: GameState
var _log_store: LogStore
var _active_session_id := -1


func _init(game: GameState, log_store: LogStore) -> void:
	_game = game
	_log_store = log_store
	channel = GameChannel.new(_send_request)


func _has_capture(capture: String) -> bool:
	return capture == RuntimeProtocol.CAPTURE


func _capture(message: String, data: Array, _session_id: int) -> bool:
	var payload: Variant = data[0] if not data.is_empty() else null
	match message:
		RuntimeProtocol.LOG_MESSAGE:
			for entry in payload if payload is Array else []:
				if entry is Dictionary:
					_log_store.append(entry, GAME_SOURCE)
			return true
		RuntimeProtocol.READY_MESSAGE:
			_game.mark_ready(str((payload as Dictionary).get("scene", "")) if payload is Dictionary else "")
			return true
		RuntimeProtocol.RESPONSE_MESSAGE:
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
	session.breaked.connect(func(_can_debug: bool) -> void: _game.mark_paused())
	session.continued.connect(_game.mark_resumed)


func _send_request(payload: Dictionary) -> bool:
	if _active_session_id < 0:
		return false
	var session := get_session(_active_session_id)
	if session == null or not session.is_active():
		return false
	session.send_message(RuntimeProtocol.REQUEST_MESSAGE, [payload])
	return true
