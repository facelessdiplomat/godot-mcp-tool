extends GutTest

const LogFileWriter := preload("res://addons/godot_mcp_tool/runtime/log_file_writer.gd")

var _path := ""


func before_each() -> void:
	_path = OS.get_user_data_dir().path_join("mcp_log_writer_test_%d.ndjson" % Time.get_ticks_usec())


func after_each() -> void:
	DirAccess.remove_absolute(_path)


func _lines() -> Array:
	var lines: Array = []
	for line in FileAccess.get_file_as_string(_path).split("\n", false):
		lines.append(JSON.parse_string(line))
	return lines


func test_writes_one_json_line_per_entry_and_one_for_readiness() -> void:
	var writer := LogFileWriter.new(_path)
	writer.send_entries([{"level": "info", "message": "Arena loaded"}, {"level": "error", "message": "Boom."}])
	writer.send_ready("res://main.tscn")
	writer.close()
	assert_eq(_lines(), [
		{"type": "log", "entry": {"level": "info", "message": "Arena loaded"}},
		{"type": "log", "entry": {"level": "error", "message": "Boom."}},
		{"type": "ready", "scene": "res://main.tscn"},
	])


func test_finds_the_log_file_among_the_user_arguments() -> void:
	assert_eq(LogFileWriter.path_from_arguments(PackedStringArray(["--level=2", "--mcp-log-file=/tmp/game.ndjson"])), "/tmp/game.ndjson")
	assert_eq(LogFileWriter.path_from_arguments(PackedStringArray(["--level=2"])), "")
