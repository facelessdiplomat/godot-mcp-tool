extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NodeDuplicateCommand := preload("res://addons/godot_mcp_tool/commands/node/node_duplicate_command.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _root: Node3D
var _props: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	var crate := _add_owned(_root, Node3D.new(), "Crate")
	crate.add_to_group("props", true)
	_add_owned(crate, MeshInstance3D.new(), "Mesh")
	_props = _add_owned(_root, Node3D.new(), "Props") as Node3D


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add_owned(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _duplicate(params: Dictionary) -> Variant:
	return await NodeDuplicateCommand.new(_context).execute(params)


func test_duplicates_a_node_with_its_children_right_after_it() -> void:
	var result: Dictionary = await _duplicate({"path": "Crate"})
	assert_eq(result["path"], "Crate2")
	assert_eq(result["source"], "Crate")
	var copy := _root.get_child(1)
	assert_eq(copy.name, &"Crate2")
	assert_eq(copy.owner, _root)
	assert_eq(copy.get_node("Mesh").owner, _root)
	assert_true(copy.is_in_group("props"))
	assert_eq(_history.last_action_name(), "MCP: Duplicate Crate")


func test_places_a_named_copy_under_another_parent_with_properties() -> void:
	var result: Dictionary = await _duplicate({"path": "Crate", "name": "CrateB", "parent": "Props", "properties": {"position": [3, 0, 0]}})
	assert_eq(result["path"], "Props/CrateB")
	assert_eq(result["applied"], ["position"])
	assert_eq((_props.get_node("CrateB") as Node3D).position, Vector3(3, 0, 0))


func test_undo_removes_the_copy() -> void:
	await _duplicate({"path": "Crate"})
	assert_true(_history.undo())
	assert_null(_root.get_node_or_null("Crate2"))


func test_duplicates_an_instance_as_an_instance() -> void:
	_add_owned(_root, (load("res://tests/fixtures/crate.tscn") as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE), "Barrel")
	var result: Dictionary = await _duplicate({"path": "Barrel"})
	var copy := _root.get_node(NodePath(result["path"]))
	assert_eq(copy.scene_file_path, "res://tests/fixtures/crate.tscn")
	assert_eq(copy.owner, _root)
	assert_eq(copy.get_node("Mesh").owner, copy)


func test_refuses_to_duplicate_the_scene_root() -> void:
	var error: Variant = await _duplicate({"path": "."})
	assert_eq((error as CommandError).code, JsonRpc.INVALID_PARAMS)


func test_refuses_a_name_that_is_taken() -> void:
	var error: Variant = await _duplicate({"path": "Crate", "name": "Props"})
	assert_true(error is CommandError)
	assert_string_contains((error as CommandError).message, "Props")
