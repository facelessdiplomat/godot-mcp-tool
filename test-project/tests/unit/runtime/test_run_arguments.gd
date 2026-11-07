extends GutTest

const GodotMcpRunArguments := preload("res://addons/godot_mcp_tool/runtime/run_arguments.gd")
const GodotMcpRunRequest := preload("res://addons/godot_mcp_tool/runtime/run_request.gd")


func test_leaves_runs_by_the_user_unchanged() -> void:
	assert_eq(GodotMcpRunArguments.extend(PackedStringArray(["--verbose"]), null, false), PackedStringArray(["--verbose"]))


func test_keeps_runs_by_the_agent_going_on_errors() -> void:
	assert_eq(GodotMcpRunArguments.extend(PackedStringArray(), GodotMcpRunRequest.new(), false), PackedStringArray(["--ignore-error-breaks"]))


func test_fixes_the_frame_rate_of_an_agent_run_on_request() -> void:
	var extended := GodotMcpRunArguments.extend(PackedStringArray(["--", "--level=2"]), GodotMcpRunRequest.new(60), false)
	assert_eq(extended, PackedStringArray(["--ignore-error-breaks", "--fixed-fps", "60", "--", "--level=2"]))


func test_keeps_the_game_windowless_when_the_editor_is() -> void:
	assert_eq(GodotMcpRunArguments.extend(PackedStringArray(), null, true), PackedStringArray(["--headless"]))


func test_puts_engine_arguments_before_user_arguments() -> void:
	var extended := GodotMcpRunArguments.extend(PackedStringArray(["--", "--level=2"]), GodotMcpRunRequest.new(), true)
	assert_eq(extended, PackedStringArray(["--ignore-error-breaks", "--headless", "--", "--level=2"]))


func test_does_not_repeat_arguments() -> void:
	assert_eq(GodotMcpRunArguments.extend(PackedStringArray(["--headless"]), null, true), PackedStringArray(["--headless"]))
	assert_eq(GodotMcpRunArguments.extend(PackedStringArray(["--fixed-fps", "30"]), GodotMcpRunRequest.new(60), false), PackedStringArray(["--fixed-fps", "30", "--ignore-error-breaks"]))
