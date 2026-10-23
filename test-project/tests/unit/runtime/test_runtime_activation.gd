extends GutTest

const RuntimeActivation := preload("res://addons/godot_mcp_tool/runtime/runtime_activation.gd")

const SERVER_ARGUMENTS := ["--mcp-log-file=/tmp/local_game.ndjson", "--mcp-port=40123"]


func test_listens_to_the_editor_when_its_debugger_is_attached() -> void:
	assert_eq(RuntimeActivation.mode_of(true, true, PackedStringArray()), RuntimeActivation.Mode.EDITOR)


func test_serves_the_server_that_started_a_debug_build() -> void:
	assert_eq(RuntimeActivation.mode_of(false, true, PackedStringArray(SERVER_ARGUMENTS)), RuntimeActivation.Mode.SERVER)


func test_stays_off_in_a_release_build_whatever_its_arguments() -> void:
	assert_eq(RuntimeActivation.mode_of(false, false, PackedStringArray(SERVER_ARGUMENTS)), RuntimeActivation.Mode.OFF)


func test_stays_off_in_a_game_started_without_the_editor_or_the_server() -> void:
	assert_eq(RuntimeActivation.mode_of(false, true, PackedStringArray()), RuntimeActivation.Mode.OFF)
