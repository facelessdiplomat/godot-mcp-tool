extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NodeAddCommand := preload("res://addons/godot_mcp_tool/commands/node/node_add_command.gd")
const NodeDeleteCommand := preload("res://addons/godot_mcp_tool/commands/node/node_delete_command.gd")
const NodeGetBoundsCommand := preload("res://addons/godot_mcp_tool/commands/node/node_get_bounds_command.gd")
const NodeGetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/node/node_get_properties_command.gd")
const NodeSetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/node/node_set_properties_command.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	_history = PlainUndoHistory.new()
	_scripts = FakeScriptEditorAccess.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), _scripts)


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func test_adds_a_node_with_properties_and_the_scene_owner() -> void:
	var result: Dictionary = await NodeAddCommand.new(_context).execute({
		"type": "MeshInstance3D",
		"name": "Crate",
		"properties": {"position": [0, 0.5, 0], "mesh": {"new": "BoxMesh"}},
	})
	var crate := _root.get_node("Crate") as MeshInstance3D
	assert_eq(result["path"], "Crate")
	assert_eq(result["type"], "MeshInstance3D")
	assert_eq(result["applied"], ["position", "mesh"])
	assert_eq(crate.owner, _root)
	assert_eq(crate.position, Vector3(0, 0.5, 0))
	assert_true(crate.mesh is BoxMesh)


func test_undo_removes_the_added_node() -> void:
	await NodeAddCommand.new(_context).execute({"type": "Node3D", "name": "Marker"})
	assert_eq(_history.last_action_name(), "MCP: Add Marker")
	assert_true(_history.undo())
	assert_null(_root.get_node_or_null("Marker"))


func test_adds_into_a_nested_parent_at_an_index() -> void:
	var player := _add_owned(_root, CharacterBody3D.new(), "Player")
	_add_owned(player, Node3D.new(), "First")
	var result: Dictionary = await NodeAddCommand.new(_context).execute({"parent": "Player", "type": "Camera3D", "name": "Camera", "index": 0})
	assert_eq(result["path"], "Player/Camera")
	assert_eq(player.get_child(0).name, &"Camera")


func test_instances_a_scene_with_the_owner_only_on_its_root() -> void:
	await NodeAddCommand.new(_context).execute({"type": "res://tests/fixtures/crate.tscn", "name": "Crate"})
	var crate := _root.get_node("Crate")
	assert_eq(crate.owner, _root)
	assert_eq(crate.scene_file_path, "res://tests/fixtures/crate.tscn")
	assert_eq(crate.get_node("Mesh").owner, crate)


func test_keeps_the_new_node_when_some_properties_are_rejected() -> void:
	var result: Dictionary = await NodeAddCommand.new(_context).execute({"type": "Node3D", "name": "Marker", "properties": {"positon": [0, 1, 0]}})
	assert_not_null(_root.get_node_or_null("Marker"))
	assert_eq((result["rejected"][0] as Dictionary)["name"], "positon")


func test_sets_global_properties_relative_to_the_new_parent() -> void:
	add_child(_root)
	var player := _add_owned(_root, Node3D.new(), "Player") as Node3D
	player.position = Vector3(10, 0, 0)
	var result: Dictionary = await NodeAddCommand.new(_context).execute({
		"parent": "Player",
		"type": "Node3D",
		"name": "Marker",
		"properties": {"global_position": [12, 0, 0]},
	})
	assert_eq(result["applied"], ["global_position"])
	assert_eq((player.get_node("Marker") as Node3D).position, Vector3(2, 0, 0))


func test_reports_a_missing_parent_with_similar_paths() -> void:
	_add_owned(_root, CharacterBody3D.new(), "Player")
	var error: Variant = await NodeAddCommand.new(_context).execute({"parent": "Playr", "type": "Node3D"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_string_contains((error as CommandError).hint, "Player")


func test_requires_an_open_scene() -> void:
	_scenes.release()
	var error: Variant = await NodeAddCommand.new(_context).execute({"type": "Node3D"})
	assert_eq((error as CommandError).code, JsonRpc.NO_SCENE)


func test_requires_a_type() -> void:
	var error: Variant = await NodeAddCommand.new(_context).execute({})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_deletes_nodes_and_undo_restores_them_with_their_owners() -> void:
	var player := _add_owned(_root, CharacterBody3D.new(), "Player")
	_add_owned(player, Camera3D.new(), "Camera")
	var result: Dictionary = await NodeDeleteCommand.new(_context).execute({"paths": ["Player"]})
	assert_eq(result["deleted"], ["Player"])
	assert_null(_root.get_node_or_null("Player"))
	assert_true(_history.undo())
	var restored := _root.get_node_or_null("Player")
	assert_not_null(restored)
	assert_eq(restored.owner, _root)
	assert_eq(restored.get_node("Camera").owner, _root)


func test_deletes_a_node_once_when_its_ancestor_is_deleted_too() -> void:
	var player := _add_owned(_root, CharacterBody3D.new(), "Player")
	_add_owned(player, Camera3D.new(), "Camera")
	var result: Dictionary = await NodeDeleteCommand.new(_context).execute({"paths": ["Player/Camera", "Player"]})
	assert_eq(result["deleted"], ["Player"])


func test_refuses_to_delete_the_scene_root() -> void:
	var error: Variant = await NodeDeleteCommand.new(_context).execute({"paths": ["."]})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_reports_missing_nodes_before_deleting_anything() -> void:
	_add_owned(_root, CharacterBody3D.new(), "Player")
	var error: Variant = await NodeDeleteCommand.new(_context).execute({"paths": ["Player", "Ghost"]})
	assert_eq((error as CommandError).code, JsonRpc.NOT_FOUND)
	assert_not_null(_root.get_node_or_null("Player"))


func test_gets_the_non_default_properties_of_a_node() -> void:
	var player := _add_owned(_root, CharacterBody3D.new(), "Player") as CharacterBody3D
	player.position = Vector3(1, 2, 3)
	var result: Dictionary = await NodeGetPropertiesCommand.new(_context).execute({"path": "Player"})
	assert_eq(result["path"], "Player")
	assert_eq(result["type"], "CharacterBody3D")
	var names: Array = (result["properties"] as Array).map(func(entry: Dictionary) -> String: return entry["name"])
	assert_has(names, "position")


func test_sets_properties_and_reports_each_one() -> void:
	_add_owned(_root, CharacterBody3D.new(), "Player")
	var result: Dictionary = await NodeSetPropertiesCommand.new(_context).execute({"path": "Player", "properties": {"position": [1, 2, 3], "speed": 5}})
	assert_eq(result["applied"], ["position"])
	assert_eq((result["rejected"][0] as Dictionary)["name"], "speed")
	assert_eq((_root.get_node("Player") as Node3D).position, Vector3(1, 2, 3))
	assert_eq(_history.last_action_name(), "MCP: Set properties of Player")


func test_requires_properties_to_set() -> void:
	_add_owned(_root, CharacterBody3D.new(), "Player")
	var error: Variant = await NodeSetPropertiesCommand.new(_context).execute({"path": "Player"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_measures_the_bounds_of_a_node_in_the_scene() -> void:
	var crate := _add_owned(_root, Node3D.new(), "Crate") as Node3D
	crate.position = Vector3(4, 0, 0)
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(2, 2, 2)
	mesh.mesh = box
	mesh.position = Vector3(0, 1, 0)
	_add_owned(crate, mesh, "Mesh")
	var result: Dictionary = await NodeGetBoundsCommand.new(_context, null).execute({"path": "Crate"})
	assert_eq(result["scene"], "res://levels/arena.tscn")
	assert_eq(result["path"], "Crate")
	assert_eq(result["position"], "Vector3(3, 0, -1)")
	assert_eq(result["size"], "Vector3(2, 2, 2)")
	assert_eq(result["visual_count"], 1)


func test_explains_bounds_of_a_node_that_is_not_3d() -> void:
	_add_owned(_root, Node.new(), "Logic")
	var error: Variant = await NodeGetBoundsCommand.new(_context, null).execute({"path": "Logic"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "not a 3D node")

