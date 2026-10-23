extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NodeReparentCommand := preload("res://addons/godot_mcp_tool/commands/node/node_reparent_command.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D
var _player: Node3D
var _crate: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_player = _add_owned(_root, Node3D.new(), "Player") as Node3D
	_player.position = Vector3(10, 0, 0)
	_crate = _add_owned(_root, Node3D.new(), "Crate") as Node3D
	_crate.position = Vector3(2, 0, 0)
	_add_owned(_crate, MeshInstance3D.new(), "Mesh")


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _reparent(params: Dictionary) -> Variant:
	return await NodeReparentCommand.new(_context).execute(params)


func test_moves_a_node_under_another_parent_and_keeps_its_place_in_the_world() -> void:
	var result: Dictionary = await _reparent({"path": "Crate", "parent": "Player"})
	assert_eq(result["path"], "Player/Crate")
	assert_eq(result["previous_path"], "Crate")
	assert_eq(_crate.get_parent(), _player)
	assert_eq(_crate.position, Vector3(-8, 0, 0))
	assert_eq(_crate.global_position, Vector3(2, 0, 0))
	assert_eq(_crate.owner, _root)
	assert_eq(_crate.get_node("Mesh").owner, _root)
	assert_eq(_history.last_action_name(), "MCP: Move Crate")


func test_undo_puts_the_node_back_with_its_owners() -> void:
	await _reparent({"path": "Crate", "parent": "Player"})
	assert_true(_history.undo())
	assert_eq(_crate.get_parent(), _root)
	assert_eq(_crate.get_index(), 1)
	assert_eq(_crate.position, Vector3(2, 0, 0))
	assert_eq(_crate.owner, _root)
	assert_eq(_crate.get_node("Mesh").owner, _root)


func test_can_keep_the_local_transform_instead() -> void:
	await _reparent({"path": "Crate", "parent": "Player", "keep_global_transform": false})
	assert_eq(_crate.position, Vector3(2, 0, 0))


func test_renames_a_node() -> void:
	var result: Dictionary = await _reparent({"path": "Crate", "name": "Box"})
	assert_eq(result["path"], "Box")
	assert_eq(_crate.name, &"Box")
	assert_eq(_history.last_action_name(), "MCP: Rename Crate to Box")
	assert_true(_history.undo())
	assert_eq(_crate.name, &"Crate")


func test_moves_a_node_to_another_place_among_its_siblings() -> void:
	await _reparent({"path": "Crate", "index": 0})
	assert_eq(_crate.get_index(), 0)
	assert_true(_history.undo())
	assert_eq(_crate.get_index(), 1)


func test_keeps_node_paths_that_move_along_with_their_target() -> void:
	var mount := _add_owned(_crate, RemoteTransform3D.new(), "Mount") as RemoteTransform3D
	mount.remote_path = NodePath("..")
	var result: Dictionary = await _reparent({"path": "Crate", "parent": "Player"})
	assert_eq(result["updated_references"], [])
	assert_eq(mount.remote_path, NodePath(".."))


func test_updates_node_paths_that_point_at_the_moved_node() -> void:
	var follower := _add_owned(_root, RemoteTransform3D.new(), "Follower") as RemoteTransform3D
	follower.remote_path = NodePath("../Crate")
	var result: Dictionary = await _reparent({"path": "Crate", "parent": "Player"})
	assert_eq(follower.remote_path, NodePath("../Player/Crate"))
	assert_eq(result["updated_references"], [{"node": "Follower", "property": "remote_path", "path": "../Player/Crate"}])
	assert_true(_history.undo())
	assert_eq(follower.remote_path, NodePath("../Crate"))


func test_updates_node_paths_of_the_moved_node_itself() -> void:
	var follower := _add_owned(_root, RemoteTransform3D.new(), "Follower") as RemoteTransform3D
	follower.remote_path = NodePath("../Crate")
	await _reparent({"path": "Follower", "parent": "Player"})
	assert_eq(follower.remote_path, NodePath("../../Crate"))


func test_updates_node_paths_after_a_rename() -> void:
	var follower := _add_owned(_root, RemoteTransform3D.new(), "Follower") as RemoteTransform3D
	follower.remote_path = NodePath("../Crate/Mesh")
	await _reparent({"path": "Crate", "name": "Box"})
	assert_eq(follower.remote_path, NodePath("../Box/Mesh"))


func test_refuses_to_move_a_node_into_its_own_children() -> void:
	var error: Variant = await _reparent({"path": "Crate", "parent": "Crate/Mesh"})
	assert_true(error is CommandError)
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_refuses_a_name_that_a_sibling_has() -> void:
	var error: Variant = await _reparent({"path": "Crate", "name": "Player"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "Player")


func test_refuses_to_move_next_to_a_node_of_the_same_name() -> void:
	_add_owned(_player, Node3D.new(), "Crate")
	var error: Variant = await _reparent({"path": "Crate", "parent": "Player"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).hint, "name")


func test_refuses_to_move_the_scene_root() -> void:
	var error: Variant = await _reparent({"path": ".", "parent": "Player"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_refuses_nodes_inside_an_instanced_scene() -> void:
	_add_owned(_root, (load("res://tests/fixtures/crate.tscn") as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), "Barrel")
	var error: Variant = await _reparent({"path": "Barrel/Mesh", "parent": "Player"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_needs_a_new_parent_name_or_index() -> void:
	var error: Variant = await _reparent({"path": "Crate"})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)
