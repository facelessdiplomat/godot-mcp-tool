extends Node

const GodotMcpCommandRouter := preload("../commands/command_router.gd")
const GodotMcpDebuggerSink := preload("debugger_sink.gd")
const GodotMcpGameRequestResponder := preload("game_request_responder.gd")
const GodotMcpGameTime := preload("game_time.gd")
const GodotMcpLogFileWriter := preload("log_file_writer.gd")
const GodotMcpRuntimeActivation := preload("runtime_activation.gd")
const GodotMcpRuntimeLogger := preload("runtime_logger.gd")
const GodotMcpRuntimeProtocol := preload("runtime_protocol.gd")
const GodotMcpServerConnection := preload("server_connection.gd")

const GAME_COMMAND_CATALOG_FILE := "game_commands/game_command_catalog.gd"

var _logger: GodotMcpRuntimeLogger
var _time: GodotMcpGameTime
var _sink: RefCounted
var _responder: GodotMcpGameRequestResponder
var _server_connection: GodotMcpServerConnection


func _init() -> void:
	var user_arguments := OS.get_cmdline_user_args()
	var mode := GodotMcpRuntimeActivation.mode_of(EngineDebugger.is_active(), OS.is_debug_build(), user_arguments)
	if mode == GodotMcpRuntimeActivation.GodotMcpMode.OFF:
		return
	_time = GodotMcpGameTime.new()
	add_child(_time)
	match mode:
		GodotMcpRuntimeActivation.GodotMcpMode.EDITOR:
			_sink = GodotMcpDebuggerSink.new()
			_listen_to_the_editor()
		GodotMcpRuntimeActivation.GodotMcpMode.SERVER:
			_sink = GodotMcpLogFileWriter.new(GodotMcpLogFileWriter.path_from_arguments(user_arguments))
			_connect_to_the_server(GodotMcpServerConnection.port_from_arguments(user_arguments), GodotMcpServerConnection.token_from_environment())
	_logger = GodotMcpRuntimeLogger.new(true)
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
	if EngineDebugger.has_capture(GodotMcpRuntimeProtocol.CAPTURE):
		EngineDebugger.unregister_message_capture(GodotMcpRuntimeProtocol.CAPTURE)


func _listen_to_the_editor() -> void:
	_responder = GodotMcpGameRequestResponder.new(_game_router())
	EngineDebugger.register_message_capture(GodotMcpRuntimeProtocol.CAPTURE, _on_editor_message)


func _connect_to_the_server(port: int, token: String) -> void:
	if port <= 0 or token.is_empty():
		return
	_server_connection = GodotMcpServerConnection.new(port, token, GodotMcpGameRequestResponder.new(_game_router()))


func _game_router() -> GodotMcpCommandRouter:
	var catalog := load((get_script() as Script).resource_path.get_base_dir().path_join(GAME_COMMAND_CATALOG_FILE)) as GDScript
	return catalog.call(&"build_router", _current_scene, _time)


func _on_editor_message(message: String, data: Array) -> bool:
	if message != GodotMcpRuntimeProtocol.REQUEST_IN_GAME or data.is_empty() or not data[0] is Dictionary:
		return false
	_answer(data[0])
	return true


func _answer(request: Dictionary) -> void:
	var answer: Dictionary = await _responder.respond(request)
	EngineDebugger.send_message(GodotMcpRuntimeProtocol.RESPONSE_MESSAGE, [answer])


func _flush() -> void:
	var entries := _logger.take_pending()
	if not entries.is_empty():
		_sink.send_entries(entries)


func _current_scene() -> Node:
	return get_tree().current_scene if is_inside_tree() else null


func _current_scene_path() -> String:
	var current_scene := _current_scene()
	return current_scene.scene_file_path if current_scene != null else ""
