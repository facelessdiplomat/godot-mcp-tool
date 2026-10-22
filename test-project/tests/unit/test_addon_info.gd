extends GutTest

const AddonInfo := preload("res://addons/godot_mcp_tool/addon_info.gd")


func test_version_matches_plugin_cfg() -> void:
	var plugin_config := ConfigFile.new()
	assert_eq(plugin_config.load("res://addons/godot_mcp_tool/plugin.cfg"), OK)
	assert_eq(AddonInfo.ADDON_VERSION, plugin_config.get_value("plugin", "version"))


func test_discovery_file_lives_inside_the_godot_folder() -> void:
	assert_true(AddonInfo.DISCOVERY_RELATIVE_PATH.begins_with(".godot/"))


func test_captures_live_inside_the_godot_folder() -> void:
	assert_true(AddonInfo.CAPTURES_RELATIVE_PATH.begins_with(".godot/"))
