extends RefCounted

const WARNING_ERROR_TYPE := 1
const MAXIMUM_MESSAGE_LENGTH := 2000
const MAXIMUM_STACK_FRAMES := 16


static func from_message(message: String, is_error: bool) -> Dictionary:
	return {"level": "error" if is_error else "info", "message": _shorten(message.strip_edges(false, true))}


static func from_error(function: String, file: String, line: int, code: String, rationale: String, error_type: int, script_backtraces: Array, hidden_script_prefix: String = "") -> Dictionary:
	var entry := {
		"level": "warning" if error_type == WARNING_ERROR_TYPE else "error",
		"message": _shorten(rationale if not rationale.is_empty() else code),
	}
	var frames := _script_frames(script_backtraces, hidden_script_prefix)
	if frames.is_empty():
		if not file.is_empty():
			entry["location"] = "%s:%d" % [engine_source_path(file), line]
		if not function.is_empty():
			entry["function"] = function
		return entry
	var first_frame: Dictionary = frames[0]
	entry["location"] = first_frame["location"]
	entry["function"] = first_frame["function"]
	entry["stack"] = frames.map(func(frame: Dictionary) -> String: return "%s in %s" % [frame["location"], frame["function"]])
	return entry


static func engine_source_path(file: String) -> String:
	return file.trim_prefix("./")


static func _script_frames(script_backtraces: Array, hidden_script_prefix: String) -> Array:
	for backtrace in script_backtraces:
		var script_backtrace := backtrace as ScriptBacktrace
		if script_backtrace == null or script_backtrace.is_empty():
			continue
		var frames: Array = []
		for index in script_backtrace.get_frame_count():
			var frame_file := script_backtrace.get_frame_file(index)
			if not hidden_script_prefix.is_empty() and frame_file.begins_with(hidden_script_prefix):
				continue
			frames.append({
				"location": "%s:%d" % [frame_file, script_backtrace.get_frame_line(index)],
				"function": script_backtrace.get_frame_function(index),
			})
			if frames.size() >= MAXIMUM_STACK_FRAMES:
				break
		return frames
	return []


static func _shorten(text: String) -> String:
	if text.length() <= MAXIMUM_MESSAGE_LENGTH:
		return text
	return "%s… [%d characters cut]" % [text.left(MAXIMUM_MESSAGE_LENGTH), text.length() - MAXIMUM_MESSAGE_LENGTH]
