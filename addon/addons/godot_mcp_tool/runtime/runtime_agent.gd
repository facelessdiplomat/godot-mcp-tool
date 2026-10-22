extends Node

const DebuggerSink := preload("debugger_sink.gd")
const LogFileWriter := preload("log_file_writer.gd")
const RuntimeLogger := preload("runtime_logger.gd")

var _logger: RuntimeLogger
var _sink: RefCounted


func _init() -> void:
	var log_file_path := LogFileWriter.path_from_arguments(OS.get_cmdline_user_args())
	if EngineDebugger.is_active():
		_sink = DebuggerSink.new()
	elif not log_file_path.is_empty():
		_sink = LogFileWriter.new(log_file_path)
	else:
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


func _exit_tree() -> void:
	if _logger == null:
		return
	_flush()
	OS.remove_logger(_logger)
	_sink.close()


func _flush() -> void:
	var entries := _logger.take_pending()
	if not entries.is_empty():
		_sink.send_entries(entries)


func _current_scene_path() -> String:
	var current_scene := get_tree().current_scene
	return current_scene.scene_file_path if current_scene != null else ""
