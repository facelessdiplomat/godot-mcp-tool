extends Node

const CommandRouter := preload("../commands/command_router.gd")
const DebuggerSink := preload("debugger_sink.gd")
const GameRequestResponder := preload("game_request_responder.gd")
const LogFileWriter := preload("log_file_writer.gd")
const RuntimeActivation := preload("runtime_activation.gd")
const RuntimeLogger := preload("runtime_logger.gd")
const RuntimeProtocol := preload("runtime_protocol.gd")
const ServerConnection := preload("server_connection.gd")

const GAME_COMMAND_CATALOG_FILE := "game_commands/game_command_catalog.gd"

var _logger: RuntimeLogger
var _sink: RefCounted
var _responder: GameRequestResponder
var _server_connection: ServerConnection


func _init() -> void:
	var user_arguments := OS.get_cmdline_user_args()
	match RuntimeActivation.mode_of(EngineDebugger.is_active(), OS.is_debug_build(), user_arguments):
		RuntimeActivation.Mode.EDITOR:
			_sink = DebuggerSink.new()
			_listen_to_the_editor()
		RuntimeActivation.Mode.SERVER:
			_sink = LogFileWriter.new(LogFileWriter.path_from_arguments(user_arguments))
			_connect_to_the_server(ServerConnection.port_from_arguments(user_arguments), ServerConnection.token_from_environment())
		_:
			return
	_logger = RuntimeLogger.new(true)
	OS.add_logger(_logger)


func _ready() -> void:
	if _logger == null:
		set_process(false)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	await get_tree().process_frame
	_flush()
	_sink.send_ready(_current_scene_path())


func _process(_delta: float) -> void:
	_flush()
	if _server_connection != null:
		_server_connection.poll()


func _exit_tree() -> void:
	if _logger == null:
		return
	_flush()
	OS.remove_logger(_logger)
	_sink.close()
	if _server_connection != null:
		_server_connection.close()
	if EngineDebugger.has_capture(RuntimeProtocol.CAPTURE):
		EngineDebugger.unregister_message_capture(RuntimeProtocol.CAPTURE)


func _listen_to_the_editor() -> void:
	_responder = GameRequestResponder.new(_game_router())
	EngineDebugger.register_message_capture(RuntimeProtocol.CAPTURE, _on_editor_message)


func _connect_to_the_server(port: int, token: String) -> void:
	if port <= 0 or token.is_empty():
		return
	_server_connection = ServerConnection.new(port, token, GameRequestResponder.new(_game_router()))


func _game_router() -> CommandRouter:
	var catalog := load((get_script() as Script).resource_path.get_base_dir().path_join(GAME_COMMAND_CATALOG_FILE)) as GDScript
	return catalog.call(&"build_router", _current_scene)


func _on_editor_message(message: String, data: Array) -> bool:
	if message != RuntimeProtocol.REQUEST_IN_GAME or data.is_empty() or not data[0] is Dictionary:
		return false
	_answer(data[0])
	return true


func _answer(request: Dictionary) -> void:
	var answer: Dictionary = await _responder.respond(request)
	EngineDebugger.send_message(RuntimeProtocol.RESPONSE_MESSAGE, [answer])


func _flush() -> void:
	var entries := _logger.take_pending()
	if not entries.is_empty():
		_sink.send_entries(entries)


func _current_scene() -> Node:
	return get_tree().current_scene if is_inside_tree() else null


func _current_scene_path() -> String:
	var current_scene := _current_scene()
	return current_scene.scene_file_path if current_scene != null else ""
