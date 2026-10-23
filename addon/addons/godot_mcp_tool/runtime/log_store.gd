extends RefCounted

const DEFAULT_CAPACITY := 2000
const RECENT_ERROR_LIMIT := 5

var last_seq := 0
var error_count := 0
var warning_count := 0

var _capacity: int
var _wall_clock_msec: Callable
var _entries: Array = []
var _recent_errors: Array = []


func _init(capacity: int = DEFAULT_CAPACITY, wall_clock_msec: Callable = Callable()) -> void:
	_capacity = capacity
	_wall_clock_msec = wall_clock_msec if wall_clock_msec.is_valid() else _system_wall_clock_msec


func append(entry: Dictionary, source: String) -> void:
	last_seq += 1
	var stored := entry.duplicate()
	stored["seq"] = last_seq
	stored["source"] = source
	_entries.append(stored)
	if _entries.size() > _capacity:
		_entries.pop_front()
	match stored.get("level"):
		"error":
			error_count += 1
			var summary := _summary_of(stored)
			summary["logged_at_ms"] = _wall_clock_msec.call()
			_recent_errors.append(summary)
			if _recent_errors.size() > RECENT_ERROR_LIMIT:
				_recent_errors.pop_front()
		"warning":
			warning_count += 1


func entries_after(after_seq: int, levels: PackedStringArray, limit: int) -> Dictionary:
	var oldest_seq: int = _entries[0]["seq"] if not _entries.is_empty() else last_seq + 1
	var selected: Array = []
	var next_after := last_seq
	var more := false
	for entry in _entries:
		if entry["seq"] <= after_seq:
			continue
		if not levels.is_empty() and not str(entry.get("level")) in levels:
			continue
		if selected.size() >= limit:
			more = true
			next_after = selected.back()["seq"]
			break
		selected.append(entry)
	return {
		"entries": selected,
		"more": more,
		"next_after": maxi(next_after, after_seq),
		"skipped": maxi(0, oldest_seq - after_seq - 1),
		"last_seq": last_seq,
	}


func status() -> Dictionary:
	return {"last_seq": last_seq, "errors": error_count, "warnings": warning_count, "recent_errors": _recent_errors.duplicate()}


func _system_wall_clock_msec() -> int:
	return int(Time.get_unix_time_from_system() * 1000.0)


static func _summary_of(entry: Dictionary) -> Dictionary:
	var summary := {"seq": entry["seq"], "source": entry["source"], "message": entry.get("message", "")}
	if entry.has("location"):
		summary["location"] = entry["location"]
	return summary
