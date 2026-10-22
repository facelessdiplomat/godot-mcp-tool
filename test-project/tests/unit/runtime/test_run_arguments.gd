extends GutTest

const RunArguments := preload("res://addons/godot_mcp_tool/runtime/run_arguments.gd")


func test_leaves_runs_by_the_user_unchanged() -> void:
	assert_eq(RunArguments.extend(PackedStringArray(["--verbose"]), false, false), PackedStringArray(["--verbose"]))


func test_keeps_runs_by_the_agent_going_on_errors() -> void:
	assert_eq(RunArguments.extend(PackedStringArray(), true, false), PackedStringArray(["--ignore-error-breaks"]))


func test_keeps_the_game_windowless_when_the_editor_is() -> void:
	assert_eq(RunArguments.extend(PackedStringArray(), false, true), PackedStringArray(["--headless"]))


func test_puts_engine_arguments_before_user_arguments() -> void:
	var extended := RunArguments.extend(PackedStringArray(["--", "--level=2"]), true, true)
	assert_eq(extended, PackedStringArray(["--ignore-error-breaks", "--headless", "--", "--level=2"]))


func test_does_not_repeat_arguments() -> void:
	assert_eq(RunArguments.extend(PackedStringArray(["--headless"]), false, true), PackedStringArray(["--headless"]))
