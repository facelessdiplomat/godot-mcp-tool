extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpGameNavigationPathCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_navigation_path_command.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpNavigationGetPathCommand := preload("res://addons/godot_mcp_tool/commands/navigation/navigation_get_path_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _level: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_level = Node3D.new()
	_level.name = "Level"
	_level.scene_file_path = "res://level.tscn"
	_scenes.edited_root = _level


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	if is_instance_valid(_level):
		_level.free()


func _add_region(region_name: String, from_x: float, to_x: float) -> NavigationRegion3D:
	var navigation_mesh := NavigationMesh.new()
	navigation_mesh.vertices = PackedVector3Array([Vector3(from_x, 0, -4), Vector3(to_x, 0, -4), Vector3(to_x, 0, 4), Vector3(from_x, 0, 4)])
	navigation_mesh.add_polygon(PackedInt32Array([0, 1, 2, 3]))
	var region := NavigationRegion3D.new()
	region.name = region_name
	region.navigation_mesh = navigation_mesh
	_level.add_child(region)
	region.owner = _level
	return region


func _path_in_editor(params: Dictionary) -> Variant:
	return await GodotMcpNavigationGetPathCommand.new(_context, null).execute(params)


func test_finds_a_path_across_one_region_of_the_scene() -> void:
	_add_region("West", -10, -2)
	var report: Dictionary = await _path_in_editor({"from": [-9, 0, 0], "to": [-3, 0, 2]})
	assert_eq(report["reached"], true)
	assert_eq(report["scene"], "res://level.tscn")
	assert_gt(float(report["length"]), 6.0)
	assert_eq(report["navigation_layers"], [{"number": 1, "name": ""}])


func test_says_where_a_path_stops_when_two_regions_do_not_meet() -> void:
	_add_region("West", -10, -2)
	_add_region("East", 3, 12)
	var report: Dictionary = await _path_in_editor({"from": [-9, 0, 0], "to": [10, 0, 0]})
	assert_eq(report["reached"], false)
	assert_almost_eq(float(report["short_by"]), 12.0, 0.1)


func test_leaves_the_navigation_map_of_the_editor_alone() -> void:
	_add_region("West", -10, -2)
	await _path_in_editor({"from": [-9, 0, 0], "to": [-3, 0, 2]})
	assert_eq(_level.get_child_count(), 1)
	assert_eq(get_tree().root.find_children("*", "SubViewport", false, false).filter(func(node: Node) -> bool: return node.get_child_count() > 0 and node.get_child(0).name == "Level"), [])


func test_explains_a_scene_without_navigation_regions() -> void:
	var refused: Variant = await _path_in_editor({"from": [0, 0, 0], "to": [1, 0, 0]})
	assert_true(refused is GodotMcpCommandError)
	assert_string_contains((refused as GodotMcpCommandError).message, "has no NavigationRegion3D")
	assert_string_contains((refused as GodotMcpCommandError).hint, "navigation_bake")


func test_explains_regions_that_were_never_baked() -> void:
	var region := NavigationRegion3D.new()
	region.navigation_mesh = NavigationMesh.new()
	_level.add_child(region)
	region.owner = _level
	var refused: Variant = await _path_in_editor({"from": [0, 0, 0], "to": [1, 0, 0]})
	assert_true(refused is GodotMcpCommandError)
	assert_string_contains((refused as GodotMcpCommandError).message, "baked")


func test_requires_both_ends_of_the_path() -> void:
	var refused: Variant = await _path_in_editor({"from": [0, 0, 0]})
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_takes_navigation_layers_by_number() -> void:
	_add_region("West", -10, -2)
	var report: Dictionary = await _path_in_editor({"from": [-9, 0, 0], "to": [-3, 0, 2], "navigation_layers": [2]})
	assert_eq(report["reached"], false)
	assert_eq(report["navigation_layers"], [{"number": 2, "name": ""}])


func test_finds_a_path_in_the_running_game() -> void:
	_add_region("West", -10, -2)
	add_child(_level)
	var scene := GodotMcpGameScene.new(func() -> Node: return _level)
	var report: Dictionary = await GodotMcpGameNavigationPathCommand.new(scene, GodotMcpVariantCodec.new()).execute({"from": [-9, 0, 0], "to": [-3, 0, 2]})
	remove_child(_level)
	assert_eq(report["reached"], true)
	assert_eq(report["scene"], "res://level.tscn")
