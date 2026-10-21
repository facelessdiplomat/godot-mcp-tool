extends GutTest

const GodotVersionText := preload("res://addons/godot_mcp_tool/editor/godot_version_text.gd")


func test_formats_a_custom_build_without_a_patch_number() -> void:
	var version_info := {
		"major": 4, "minor": 8, "patch": 0, "status": "beta", "build": "custom_build",
		"hash": "679066724352c12673001d692d41dc2dab9314c0",
	}
	assert_eq(GodotVersionText.from_version_info(version_info), "4.8.beta.custom_build.679066724")


func test_formats_a_release_with_a_patch_number() -> void:
	var version_info := {"major": 4, "minor": 2, "patch": 2, "status": "stable", "build": "official", "hash": "15073afe3856abd2aa1622492fe50026c7d63dc1"}
	assert_eq(GodotVersionText.from_version_info(version_info), "4.2.2.stable.official.15073afe3")


func test_omits_a_missing_hash() -> void:
	var version_info := {"major": 4, "minor": 3, "patch": 0, "status": "stable", "build": "custom_build", "hash": ""}
	assert_eq(GodotVersionText.from_version_info(version_info), "4.3.stable.custom_build")


func test_describes_the_running_engine() -> void:
	var version_info := Engine.get_version_info()
	var expected_prefix := "%d.%d" % [version_info["major"], version_info["minor"]]
	assert_true(GodotVersionText.from_version_info(version_info).begins_with(expected_prefix))
