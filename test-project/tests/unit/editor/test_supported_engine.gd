extends GutTest

const SupportedEngine := preload("res://addons/godot_mcp_tool/editor/supported_engine.gd")


func test_accepts_godot_4_7_and_newer() -> void:
	assert_eq(SupportedEngine.problem_with({"major": 4, "minor": 7, "patch": 0, "status": "stable", "build": "official", "hash": "5b4e0cb0fd"}), "")
	assert_eq(SupportedEngine.problem_with({"major": 4, "minor": 8, "patch": 0, "status": "beta", "build": "custom_build", "hash": "6790667243"}), "")
	assert_eq(SupportedEngine.problem_with({"major": 5, "minor": 0, "patch": 0, "status": "dev", "build": "custom_build", "hash": ""}), "")


func test_refuses_older_editors_and_says_which_version_the_plugin_needs() -> void:
	var problem := SupportedEngine.problem_with({"major": 4, "minor": 6, "patch": 2, "status": "stable", "build": "official", "hash": "71f334935"})
	assert_string_contains(problem, "Godot MCP Tool needs Godot 4.7 or newer")
	assert_string_contains(problem, "this editor is Godot 4.6.2.stable.official.71f334935")
	assert_string_contains(problem, "Project Settings → Plugins")


func test_refuses_godot_3() -> void:
	assert_string_contains(SupportedEngine.problem_with({"major": 3, "minor": 6, "patch": 0, "status": "stable", "build": "official", "hash": "de2f0f147"}), "needs Godot 4.7 or newer")
