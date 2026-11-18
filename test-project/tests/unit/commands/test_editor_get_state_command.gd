extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpEditorGetStateCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_get_state_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _scripts: FakeScriptEditorAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	_scripts = FakeScriptEditorAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), _scripts)


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _add(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func test_reports_the_scene_the_selection_and_the_script_on_screen() -> void:
	var enemy := _add(_root, CharacterBody3D.new(), "Enemy")
	var mesh := _add(enemy, MeshInstance3D.new(), "Mesh")
	_scenes.selected_nodes = [enemy, mesh]
	_scenes.selected_file = "res://materials/ice.tres"
	_scenes.unsaved_roots = [_root]
	_scripts.script_place = {"path": "res://enemy.gd", "line": 42, "selection": "velocity.y = 5"}
	var state: Dictionary = await GodotMcpEditorGetStateCommand.new(_context).execute({})
	assert_eq(state["scene"], "res://levels/arena.tscn")
	assert_eq(state["unsaved"], true)
	assert_eq(state["main_screen"], "3D")
	assert_eq(state["selected_nodes"], [{"path": "Enemy", "type": "CharacterBody3D"}, {"path": "Enemy/Mesh", "type": "MeshInstance3D"}])
	assert_eq(state["selected_files"], ["res://materials/ice.tres"])
	assert_eq(state["script"], {"path": "res://enemy.gd", "line": 42, "selection": "velocity.y = 5"})
	assert_eq(state["open_scenes"], ["res://levels/arena.tscn"])


func test_reports_an_editor_without_an_open_scene() -> void:
	_scenes.release()
	var state: Dictionary = await GodotMcpEditorGetStateCommand.new(_context).execute({})
	assert_eq(state["scene"], "")
	assert_eq(state["selected_nodes"], [])
	assert_eq(state["open_scenes"], [])
