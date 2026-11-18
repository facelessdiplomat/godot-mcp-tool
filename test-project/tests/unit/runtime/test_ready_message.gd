extends GutTest

const GodotMcpReadyMessage := preload("res://addons/godot_mcp_tool/runtime/ready_message.gd")


func test_carries_the_scene_whether_the_game_has_a_window_and_its_size() -> void:
	var payload := GodotMcpReadyMessage.build("res://main.tscn", true, Vector2i(1024, 768))
	assert_eq(GodotMcpReadyMessage.scene_of(payload), "res://main.tscn")
	assert_true(GodotMcpReadyMessage.is_windowless(payload))
	assert_eq(GodotMcpReadyMessage.window_size_of(payload), Vector2i(1024, 768))


func test_takes_a_message_without_the_window_flag_for_a_game_with_a_window() -> void:
	assert_eq(GodotMcpReadyMessage.scene_of({"scene": "res://main.tscn"}), "res://main.tscn")
	assert_false(GodotMcpReadyMessage.is_windowless({"scene": "res://main.tscn"}))


func test_reads_nothing_from_a_message_that_is_not_a_dictionary() -> void:
	assert_eq(GodotMcpReadyMessage.scene_of(null), "")
	assert_false(GodotMcpReadyMessage.is_windowless("ready"))
	assert_eq(GodotMcpReadyMessage.window_size_of(null), Vector2i.ZERO)


func test_reads_no_window_size_from_a_message_without_one() -> void:
	assert_eq(GodotMcpReadyMessage.window_size_of({"scene": "res://main.tscn"}), Vector2i.ZERO)
	assert_eq(GodotMcpReadyMessage.window_size_of({"window_size": "big"}), Vector2i.ZERO)
