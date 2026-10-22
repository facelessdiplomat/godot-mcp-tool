extends GutTest

const AutoloadNames := preload("res://addons/godot_mcp_tool/project/autoload_names.gd")


func test_accepts_usual_autoload_names() -> void:
	assert_eq(AutoloadNames.problem_with("GameState"), "")
	assert_eq(AutoloadNames.problem_with("SFX"), "")
	assert_eq(AutoloadNames.problem_with("KeyBindings"), "")


func test_explains_names_that_godot_refuses() -> void:
	assert_string_contains(AutoloadNames.problem_with("game state"), "identifier")
	assert_string_contains(AutoloadNames.problem_with("Node3D"), "engine class")
	assert_string_contains(AutoloadNames.problem_with("PatrolPoint"), "class_name")
	assert_string_contains(AutoloadNames.problem_with("Vector3"), "built-in type")
	assert_string_contains(AutoloadNames.problem_with("KEY_A"), "global constant")
	assert_string_contains(AutoloadNames.problem_with("OK"), "global constant")
	assert_string_contains(AutoloadNames.problem_with("await"), "keyword")
	assert_string_contains(AutoloadNames.problem_with("PI"), "keyword")
