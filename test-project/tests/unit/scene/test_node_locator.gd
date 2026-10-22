extends GutTest

const NodeLocator := preload("res://addons/godot_mcp_tool/scene/node_locator.gd")

var _root: Node3D
var _player: CharacterBody3D
var _camera: Camera3D


func before_each() -> void:
	_root = autofree(Node3D.new())
	_root.name = "Arena"
	_player = CharacterBody3D.new()
	_player.name = "Player"
	_root.add_child(_player)
	_camera = Camera3D.new()
	_camera.name = "Camera"
	_player.add_child(_camera)


func test_finds_the_root_by_dot_or_empty_path() -> void:
	assert_eq(NodeLocator.find(_root, "."), _root)
	assert_eq(NodeLocator.find(_root, ""), _root)


func test_finds_nested_nodes_by_relative_path() -> void:
	assert_eq(NodeLocator.find(_root, "Player/Camera"), _camera)


func test_accepts_paths_that_start_with_the_root_name() -> void:
	assert_eq(NodeLocator.find(_root, "Arena"), _root)
	assert_eq(NodeLocator.find(_root, "Arena/Player"), _player)


func test_returns_null_for_a_missing_node() -> void:
	assert_null(NodeLocator.find(_root, "Player/Mesh"))


func test_describes_paths_relative_to_the_root() -> void:
	assert_eq(NodeLocator.path_of(_root, _root), ".")
	assert_eq(NodeLocator.path_of(_root, _camera), "Player/Camera")


func test_suggests_similar_existing_paths() -> void:
	assert_has(NodeLocator.similar_paths(_root, "Player/Camra"), "Player/Camera")
