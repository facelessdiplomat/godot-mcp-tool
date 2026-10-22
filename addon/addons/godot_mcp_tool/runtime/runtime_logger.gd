extends Logger

const LogEntryBuilder := preload("log_entry_builder.gd")

const DEFAULT_PENDING_LIMIT := 1000
const IGNORED_ENGINE_SOURCES := ["servers/rendering/dummy/", "modules/gdscript/language_server/"]

var _include_plain_messages: bool
var _pending_limit: int
var _addon_script_prefix: String
var _mutex := Mutex.new()
var _pending: Array = []
var _dropped := 0


func _init(include_plain_messages: bool, pending_limit: int = DEFAULT_PENDING_LIMIT) -> void:
	_include_plain_messages = include_plain_messages
	_pending_limit = pending_limit
	_addon_script_prefix = (get_script() as Script).resource_path.get_base_dir().get_base_dir() + "/"


func _log_message(message: String, error: bool) -> void:
	if not error and not _include_plain_messages:
		return
	_keep(LogEntryBuilder.from_message(message, error))


func _log_error(function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
	var engine_source := LogEntryBuilder.engine_source_path(file)
	if IGNORED_ENGINE_SOURCES.any(func(ignored_source: String) -> bool: return engine_source.begins_with(ignored_source)):
		return
	_keep(LogEntryBuilder.from_error(function, file, line, code, rationale, error_type, script_backtraces, _addon_script_prefix))


func take_pending() -> Array:
	_mutex.lock()
	var taken := _pending
	if _dropped > 0:
		taken.append({
			"level": "warning",
			"message": "%d log entries were dropped because they came faster than they could be passed on." % _dropped,
			"time_ms": Time.get_ticks_msec(),
		})
	_pending = []
	_dropped = 0
	_mutex.unlock()
	return taken


func _keep(entry: Dictionary) -> void:
	entry["time_ms"] = Time.get_ticks_msec()
	_mutex.lock()
	if _pending.size() < _pending_limit:
		_pending.append(entry)
	else:
		_dropped += 1
	_mutex.unlock()
