extends GutTest

const RuntimeLogger := preload("res://addons/godot_mcp_tool/runtime/runtime_logger.gd")


func test_collects_messages_and_errors_until_taken() -> void:
	var logger := RuntimeLogger.new(true)
	logger._log_message("Hello\n", false)
	logger._log_error("_ready", "res://player.gd", 12, "", "Invalid call.", false, 2, [])
	var taken := logger.take_pending()
	assert_eq(taken.size(), 2)
	assert_eq((taken[0] as Dictionary)["message"], "Hello")
	assert_eq((taken[1] as Dictionary)["location"], "res://player.gd:12")
	assert_true((taken[1] as Dictionary).has("time_ms"))
	assert_eq(logger.take_pending(), [])


func test_can_ignore_plain_messages() -> void:
	var logger := RuntimeLogger.new(false)
	logger._log_message("Importing\n", false)
	logger._log_message("Broken\n", true)
	assert_eq(logger.take_pending().size(), 1)


func test_drops_entries_beyond_its_limit_and_says_so() -> void:
	var logger := RuntimeLogger.new(true, 2)
	for index in 5:
		logger._log_message("line %d" % index, false)
	var taken := logger.take_pending()
	assert_eq(taken.size(), 3)
	assert_eq((taken[2] as Dictionary)["level"], "warning")
	assert_string_contains((taken[2] as Dictionary)["message"], "3")
