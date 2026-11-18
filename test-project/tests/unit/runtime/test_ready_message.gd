extends GutTest

const GodotMcpReadyMessage := preload("res://addons/godot_mcp_tool/runtime/ready_message.gd")


func test_carries_the_scene_and_whether_the_game_has_a_window() -> void:
	var payload := GodotMcpReadyMessage.build("res://main.tscn", true)
	assert_eq(GodotMcpReadyMessage.scene_of(payload), "res://main.tscn")
	assert_true(GodotMcpReadyMessage.is_windowless(payload))


func test_takes_a_message_without_the_window_flag_for_a_game_with_a_window() -> void:
	assert_eq(GodotMcpReadyMessage.scene_of({"scene": "res://main.tscn"}), "res://main.tscn")
	assert_false(GodotMcpReadyMessage.is_windowless({"scene": "res://main.tscn"}))


func test_reads_nothing_from_a_message_that_is_not_a_dictionary() -> void:
	assert_eq(GodotMcpReadyMessage.scene_of(null), "")
	assert_false(GodotMcpReadyMessage.is_windowless("ready"))
