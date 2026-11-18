extends Logger

var _mutex := Mutex.new()
var _errors: Array = []


func _log_error(_function: String, file: String, line: int, code: String, rationale: String, _editor_notify: bool, error_type: int, _script_backtraces: Array[ScriptBacktrace]) -> void:
	if error_type != ERROR_TYPE_SHADER:
		return
	_mutex.lock()
	_errors.append({"file": file, "line": line, "message": rationale if not rationale.is_empty() else code})
	_mutex.unlock()


func taken() -> Array:
	_mutex.lock()
	var errors := _errors
	_errors = []
	_mutex.unlock()
	return errors
