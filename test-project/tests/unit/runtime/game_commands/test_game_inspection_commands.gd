extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GamePropertiesGetCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_properties_get_command.gd")
const GamePropertiesSetCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_properties_set_command.gd")
const GameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GameTreeCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_tree_command.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _arena: Node3D
var _player: CharacterBody3D
var _scene: GameScene
var _codec: VariantCodec
var _properties: PropertyEditor


func before_each() -> void:
	_arena = Node3D.new()
	_arena.name = "Arena"
	_arena.scene_file_path = "res://levels/arena.tscn"
	_player = CharacterBody3D.new()
	_player.name = "Player"
	_arena.add_child(_player)
	_player.owner = _arena
	var camera := Camera3D.new()
	camera.name = "Camera"
	_player.add_child(camera)
	camera.owner = _arena
	var bullet := Node3D.new()
	bullet.name = "Bullet"
	_arena.add_child(bullet)
	add_child_autofree(_arena)
	_scene = GameScene.new(func() -> Node: return _arena)
	_codec = VariantCodec.new()
	_properties = PropertyEditor.new(_codec)


func _names(nodes: Array) -> Array:
	return nodes.map(func(node: Dictionary) -> String: return node["name"])


func test_describes_the_running_scene_with_nodes_created_at_runtime() -> void:
	var result: Dictionary = await GameTreeCommand.new(_scene).execute({})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(_names((result["root"] as Dictionary)["children"]), ["Player", "Bullet"])
	assert_eq(result["node_count"], 4)
	assert_false(result["truncated"])


func test_describes_a_subtree_by_its_path() -> void:
	var result: Dictionary = await GameTreeCommand.new(_scene).execute({"path": "Player"})
	assert_eq((result["root"] as Dictionary)["name"], "Player")
	assert_eq(_names((result["root"] as Dictionary)["children"]), ["Camera"])


func test_describes_the_tree_from_the_root_window() -> void:
	var result: Dictionary = await GameTreeCommand.new(_scene).execute({"path": "/root", "max_depth": 0})
	assert_eq((result["root"] as Dictionary)["name"], "root")
	assert_true(result["truncated"])


func test_reports_a_missing_node_with_similar_paths() -> void:
	var error: Variant = await GameTreeCommand.new(_scene).execute({"path": "Playr"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).hint, "Player")


func test_reads_properties_and_getter_methods() -> void:
	_player.position = Vector3(1, 2, 3)
	var result: Dictionary = await GamePropertiesGetCommand.new(_scene, _properties, _codec).execute({"path": "Player", "names": ["position", "is_on_floor()"]})
	assert_eq(result["path"], "Player")
	assert_eq(result["type"], "CharacterBody3D")
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(result["properties"], [
		{"name": "position", "type": "Vector3", "value": "Vector3(1, 2, 3)"},
		{"name": "is_on_floor()", "type": "bool", "value": false},
	])


func test_reads_only_methods_that_look_like_getters() -> void:
	var result: Dictionary = await GamePropertiesGetCommand.new(_scene, _properties, _codec).execute({"path": "Player", "names": ["queue_free()"]})
	assert_string_contains(((result["properties"] as Array)[0] as Dictionary)["error"], "is_, get_, has_ or can_")
	assert_true(is_instance_valid(_player))
	assert_false(_player.is_queued_for_deletion())


func test_explains_a_getter_that_needs_arguments() -> void:
	var result: Dictionary = await GamePropertiesGetCommand.new(_scene, _properties, _codec).execute({"path": "Player", "names": ["get_node()"]})
	assert_string_contains(((result["properties"] as Array)[0] as Dictionary)["error"], "argument")


func test_explains_an_unknown_getter() -> void:
	var result: Dictionary = await GamePropertiesGetCommand.new(_scene, _properties, _codec).execute({"path": "Player", "names": ["is_on_flor()"]})
	assert_string_contains(((result["properties"] as Array)[0] as Dictionary)["error"], "is_on_floor")


func test_reads_nodes_outside_the_scene_by_absolute_path() -> void:
	var result: Dictionary = await GamePropertiesGetCommand.new(_scene, _properties, _codec).execute({"path": str(_player.get_path()), "names": ["visible"]})
	assert_eq(result["path"], "Player")


func test_sets_properties_of_the_running_game() -> void:
	var result: Dictionary = await GamePropertiesSetCommand.new(_scene, _properties).execute({"path": "Player", "properties": {"position": [0, 5, 0], "speed": 3}})
	assert_eq(result["applied"], ["position"])
	assert_eq(((result["rejected"] as Array)[0] as Dictionary)["name"], "speed")
	assert_eq(_player.position, Vector3(0, 5, 0))
