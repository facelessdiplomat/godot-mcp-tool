extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const EditorSelectCommand := preload("res://addons/godot_mcp_tool/commands/editor/editor_select_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CRATE_SCENE := "res://tests/fixtures/crate.tscn"
const ORANGE_MATERIAL := "res://tests/fixtures/orange_material.tres"

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _player: Node3D
var _camera: Camera3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	var root := Node3D.new()
	root.name = "Arena"
	root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = root
	_player = Node3D.new()
	_player.name = "Player"
	root.add_child(_player)
	_player.owner = root
	_camera = Camera3D.new()
	_camera.name = "Camera"
	_player.add_child(_camera)
	_camera.owner = root
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func test_selects_nodes_of_the_open_scene() -> void:
	var result: Dictionary = await EditorSelectCommand.new(_context).execute({"nodes": ["Player", "Player/Camera"]})
	assert_eq(_scenes.selected_nodes, [_player, _camera] as Array[Node])
	assert_eq_deep(result, {"scene": "res://levels/arena.tscn", "nodes": ["Player", "Player/Camera"]})


func test_opens_a_scene_to_select_nodes_in_it() -> void:
	var result: Dictionary = await EditorSelectCommand.new(_context).execute({"scene": CRATE_SCENE, "nodes": ["."]})
	assert_eq(_scenes.opened_paths, PackedStringArray([CRATE_SCENE]))
	assert_eq(_scenes.selected_nodes, [_scenes.edited_root] as Array[Node])
	assert_eq(result["scene"], CRATE_SCENE)


func test_selects_a_file_in_the_file_system_dock() -> void:
	var result: Dictionary = await EditorSelectCommand.new(_context).execute({"file": ORANGE_MATERIAL})
	assert_eq(_scenes.selected_file, ORANGE_MATERIAL)
	assert_eq_deep(result, {"file": ORANGE_MATERIAL})


func test_explains_what_it_cannot_select() -> void:
	var command := EditorSelectCommand.new(_context)
	var missing_node: CommandError = await command.execute({"nodes": ["Player", "Ghost"]})
	var missing_file: CommandError = await command.execute({"file": "res://missing.tres"})
	var nothing: CommandError = await command.execute({})
	var both: CommandError = await command.execute({"nodes": ["Player"], "file": ORANGE_MATERIAL})
	assert_eq(missing_node.code, JsonRpc.NOT_FOUND)
	assert_eq(missing_file.code, JsonRpc.NOT_FOUND)
	assert_eq(nothing.code, JsonRpc.INVALID_PARAMS)
	assert_eq(both.code, JsonRpc.INVALID_PARAMS)
	assert_eq(_scenes.selected_nodes.size(), 0)
	assert_eq(_scenes.selected_file, "")
