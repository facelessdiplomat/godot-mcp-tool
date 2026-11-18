extends GutTest

const GodotMcpHeadlessWindow := preload("res://addons/godot_mcp_tool/runtime/headless_window.gd")


func test_reads_the_window_size_that_the_game_arguments_ask_for() -> void:
	var arguments := PackedStringArray(["--level=3", "--mcp-window-size=1024x768", "--mcp-port=4000"])
	assert_eq(GodotMcpHeadlessWindow.requested_window_size(arguments), Vector2i(1024, 768))


func test_finds_no_window_size_when_none_is_asked_for_or_it_is_not_a_size() -> void:
	assert_eq(GodotMcpHeadlessWindow.requested_window_size(PackedStringArray(["--level=3"])), Vector2i.ZERO)
	assert_eq(GodotMcpHeadlessWindow.requested_window_size(PackedStringArray(["--mcp-window-size=wide"])), Vector2i.ZERO)
	assert_eq(GodotMcpHeadlessWindow.requested_window_size(PackedStringArray(["--mcp-window-size=1024x"])), Vector2i.ZERO)


func test_writes_the_window_size_as_a_game_argument_that_it_reads_back() -> void:
	var argument := GodotMcpHeadlessWindow.window_size_argument(Vector2i(800, 600))
	assert_eq(argument, "--mcp-window-size=800x600")
	assert_eq(GodotMcpHeadlessWindow.requested_window_size(PackedStringArray([argument])), Vector2i(800, 600))
