extends GutTest

const PreviewLighting := preload("res://addons/godot_mcp_tool/capture/preview_lighting.gd")

var _root: Node3D


func before_each() -> void:
	_root = Node3D.new()
	_root.name = "Arena"


func after_each() -> void:
	_root.free()


func test_says_nothing_when_the_scene_has_its_own_sun_and_environment() -> void:
	var lights := Node3D.new()
	_root.add_child(lights)
	lights.add_child(DirectionalLight3D.new())
	_root.add_child(WorldEnvironment.new())
	assert_eq(PreviewLighting.note_for(_root), "")


func test_notes_a_scene_without_sun_and_environment() -> void:
	var note := PreviewLighting.note_for(_root)
	assert_string_contains(note, "DirectionalLight3D")
	assert_string_contains(note, "WorldEnvironment")
	assert_string_contains(note, "game_screenshot")


func test_names_only_what_is_missing() -> void:
	_root.add_child(DirectionalLight3D.new())
	var note := PreviewLighting.note_for(_root)
	assert_string_contains(note, "WorldEnvironment")
	assert_false(note.contains("DirectionalLight3D"))
