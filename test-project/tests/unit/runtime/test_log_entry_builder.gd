extends GutTest

const LogEntryBuilder := preload("res://addons/godot_mcp_tool/runtime/log_entry_builder.gd")

const THIS_SCRIPT := "res://tests/unit/runtime/test_log_entry_builder.gd"


func _capture_backtraces() -> Array[ScriptBacktrace]:
	return Engine.capture_script_backtraces()


func test_turns_printed_text_into_an_info_entry() -> void:
	assert_eq(LogEntryBuilder.from_message("Hello\n", false), {"level": "info", "message": "Hello"})


func test_turns_text_printed_to_stderr_into_an_error_entry() -> void:
	assert_eq(LogEntryBuilder.from_message("Broken\n", true)["level"], "error")


func test_uses_the_rationale_and_the_first_script_frame() -> void:
	var entry := LogEntryBuilder.from_error("get_node", "scene/main/node.cpp", 1800, "Method failed.", "Node not found: \"Player\".", 0, _capture_backtraces())
	assert_eq(entry["level"], "error")
	assert_eq(entry["message"], "Node not found: \"Player\".")
	assert_string_starts_with(entry["location"], THIS_SCRIPT + ":")
	assert_eq(entry["function"], "_capture_backtraces")
	assert_gt((entry["stack"] as Array).size(), 1)
	assert_string_starts_with((entry["stack"] as Array)[0], THIS_SCRIPT + ":")


func test_falls_back_to_the_code_and_the_native_location() -> void:
	var entry := LogEntryBuilder.from_error("get_node", "scene/main/node.cpp", 1800, "Condition \"p_path.is_empty()\" is true.", "", 0, [])
	assert_eq(entry["message"], "Condition \"p_path.is_empty()\" is true.")
	assert_eq(entry["location"], "scene/main/node.cpp:1800")
	assert_eq(entry["function"], "get_node")
	assert_false(entry.has("stack"))


func test_marks_warnings() -> void:
	assert_eq(LogEntryBuilder.from_error("", "", 0, "Careful.", "", 1, [])["level"], "warning")


func test_shortens_very_long_messages() -> void:
	var message: String = LogEntryBuilder.from_message("x".repeat(10000), false)["message"]
	assert_lt(message.length(), 2100)
	assert_string_ends_with(message, "characters cut]")
