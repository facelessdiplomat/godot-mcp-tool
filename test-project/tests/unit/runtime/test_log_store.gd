extends GutTest

const LogStore := preload("res://addons/godot_mcp_tool/runtime/log_store.gd")

const LOGGED_AT_MSEC := 1_761_200_000_000

var _store: LogStore


func before_each() -> void:
	_store = LogStore.new(5, func() -> int: return LOGGED_AT_MSEC)


func _sequence_numbers(page: Dictionary) -> Array:
	return (page["entries"] as Array).map(func(entry: Dictionary) -> int: return entry["seq"])


func test_numbers_entries_and_records_their_source() -> void:
	_store.append({"level": "info", "message": "started"}, "game")
	_store.append({"level": "error", "message": "parse error"}, "editor")
	var page := _store.entries_after(0, PackedStringArray(), 10)
	assert_eq(_sequence_numbers(page), [1, 2])
	assert_eq((page["entries"][1] as Dictionary)["source"], "editor")


func test_counts_errors_and_warnings_and_keeps_the_recent_errors() -> void:
	_store.append({"level": "error", "message": "first", "location": "res://player.gd:3"}, "game")
	_store.append({"level": "warning", "message": "careful"}, "game")
	_store.append({"level": "error", "message": "second", "stack": ["res://enemy.gd:9 in _ready"]}, "editor")
	var status := _store.status()
	assert_eq(status["last_seq"], 3)
	assert_eq(status["errors"], 2)
	assert_eq(status["warnings"], 1)
	assert_eq(status["recent_errors"], [
		{"seq": 1, "source": "game", "message": "first", "location": "res://player.gd:3", "logged_at_ms": LOGGED_AT_MSEC},
		{"seq": 3, "source": "editor", "message": "second", "logged_at_ms": LOGGED_AT_MSEC},
	])


func test_tells_when_an_error_was_logged_by_the_system_clock() -> void:
	var store := LogStore.new()
	var before_msec := int(Time.get_unix_time_from_system() * 1000.0)
	store.append({"level": "error", "message": "parse error"}, "editor")
	var logged_at_msec: int = (store.status()["recent_errors"] as Array)[0]["logged_at_ms"]
	assert_between(logged_at_msec, before_msec, int(Time.get_unix_time_from_system() * 1000.0))


func test_keeps_only_the_latest_errors_in_the_status() -> void:
	for index in 7:
		_store.append({"level": "error", "message": str(index)}, "game")
	var recent: Array = _store.status()["recent_errors"]
	assert_eq(recent.map(func(error: Dictionary) -> int: return error["seq"]), [3, 4, 5, 6, 7])


func test_returns_entries_after_a_cursor_filtered_by_level() -> void:
	_store.append({"level": "info", "message": "a"}, "game")
	_store.append({"level": "error", "message": "b"}, "game")
	_store.append({"level": "info", "message": "c"}, "game")
	_store.append({"level": "error", "message": "d"}, "game")
	assert_eq(_sequence_numbers(_store.entries_after(2, PackedStringArray(["error"]), 10)), [4])


func test_pages_through_many_entries() -> void:
	for index in 4:
		_store.append({"level": "info", "message": str(index)}, "game")
	var page := _store.entries_after(0, PackedStringArray(), 3)
	assert_eq(_sequence_numbers(page), [1, 2, 3])
	assert_true(page["more"])
	assert_eq(page["next_after"], 3)


func test_reports_entries_that_no_longer_fit() -> void:
	for index in 7:
		_store.append({"level": "info", "message": str(index)}, "game")
	var page := _store.entries_after(0, PackedStringArray(), 10)
	assert_eq(_sequence_numbers(page), [3, 4, 5, 6, 7])
	assert_eq(page["skipped"], 2)
	assert_false(page["more"])
	assert_eq(page["next_after"], 7)
