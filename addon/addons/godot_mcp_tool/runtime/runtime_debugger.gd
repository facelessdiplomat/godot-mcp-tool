extends EditorDebuggerPlugin

const GameState := preload("game_state.gd")
const LogStore := preload("log_store.gd")
const RuntimeProtocol := preload("runtime_protocol.gd")

const GAME_SOURCE := "game"

var _game: GameState
var _log_store: LogStore


func _init(game: GameState, log_store: LogStore) -> void:
	_game = game
	_log_store = log_store


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
	return false


func _setup_session(session_id: int) -> void:
	var session := get_session(session_id)
	session.started.connect(func() -> void: _game.mark_started(_log_store.last_seq + 1))
	session.stopped.connect(_game.mark_stopped)
	session.breaked.connect(func(_can_debug: bool) -> void: _game.mark_paused())
	session.continued.connect(_game.mark_resumed)
