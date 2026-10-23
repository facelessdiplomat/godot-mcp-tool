extends RefCounted

signal changed

const CAPACITY := 50

var _clock: Callable
var _entries: Array = []


func _init(clock: Callable = Callable()) -> void:
	_clock = clock if clock.is_valid() else _system_time_text


func record(method: String, error_message: String, duration_msec: int) -> void:
	_entries.push_front({"time": _clock.call(), "tool": method.replace(".", "_"), "error": error_message, "duration_msec": duration_msec})
	if _entries.size() > CAPACITY:
		_entries.pop_back()
	changed.emit()


func entries() -> Array:
	return _entries.duplicate()


func clear() -> void:
	_entries.clear()
	changed.emit()


func _system_time_text() -> String:
	return Time.get_time_string_from_system()
