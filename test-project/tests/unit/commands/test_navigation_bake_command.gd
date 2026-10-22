extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const EditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NavigationBakeCommand := preload("res://addons/godot_mcp_tool/commands/navigation/navigation_bake_command.gd")
const PlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CELL_SIZE_SETTING := "navigation/3d/default_cell_size"

var _scenes: FakeSceneAccess
var _history: PlainUndoHistory
var _context: EditingContext
var _arena: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_history = PlainUndoHistory.new()
	_context = EditingContext.new(_scenes, _history, VariantCodec.new(), FakeScriptEditorAccess.new())
	_arena = Node3D.new()
	_arena.name = "Arena"
	_arena.scene_file_path = "res://arena.tscn"
	add_child(_arena)
	_scenes.edited_root = _arena


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _bake(params: Dictionary = {}) -> Variant:
	return await NavigationBakeCommand.new(_context).execute(params)


func _add(parent: Node, node: Node) -> Node:
	parent.add_child(node)
	node.owner = _arena
	return node


func _add_region(name: String, navigation_mesh: NavigationMesh = NavigationMesh.new()) -> NavigationRegion3D:
	var region := NavigationRegion3D.new()
	region.name = name
	region.navigation_mesh = navigation_mesh
	return _add(_arena, region)


func _add_floor(parent: Node, size := Vector3(20, 1, 20)) -> StaticBody3D:
	var floor := StaticBody3D.new()
	floor.name = "Floor"
	floor.position = Vector3(0, -0.5, 0)
	_add(parent, floor)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	_add(floor, shape)
	return floor


func test_bakes_a_region_from_the_floor_under_it_as_one_undo_step() -> void:
	var region := _add_region("Navigation")
	_add_floor(region)
	var result: Dictionary = await _bake()
	assert_eq(result["scene"], "res://arena.tscn")
	assert_eq(result["skipped"], [])
	var baked: Dictionary = (result["regions"] as Array)[0]
	assert_eq(baked["path"], "Navigation")
	assert_eq(baked["polygons"], 2)
	assert_eq(baked["from"], "Vector3(-9.5, 0.5, -9.5)")
	assert_eq(baked["to"], "Vector3(9.5, 0.5, 9.5)")
	assert_eq(baked["agent_radius"], 0.5)
	assert_eq(baked["agent_height"], 1.5)
	assert_eq(baked["warnings"], [])
	assert_eq(_history.last_action_name(), "MCP: Bake navigation mesh")
	assert_true(_history.undo())
	assert_eq(region.navigation_mesh.get_polygon_count(), 0)
	assert_true(_history.redo())
	assert_eq(region.navigation_mesh.get_polygon_count(), 2)


func test_waits_for_changes_deferred_to_the_end_of_the_frame_as_csg_shapes_are() -> void:
	var region := _add_region("Navigation")
	var floor := StaticBody3D.new()
	floor.position = Vector3(0, -0.5, 0)
	_add(region, floor)
	var shape := CollisionShape3D.new()
	_add(floor, shape)
	var box := BoxShape3D.new()
	box.size = Vector3(20, 1, 20)
	shape.set_deferred("shape", box)
	var result: Dictionary = await _bake()
	assert_eq(((result["regions"] as Array)[0] as Dictionary)["polygons"], 2)


func test_bakes_every_region_of_the_scene_without_a_path_and_only_the_named_one_with_it() -> void:
	_add_floor(_add_region("North"))
	_add_floor(_add_region("South"))
	var every: Dictionary = await _bake()
	assert_eq((every["regions"] as Array).map(func(region: Dictionary) -> String: return region["path"]), ["North", "South"])
	var named: Dictionary = await _bake({"path": "South"})
	assert_eq((named["regions"] as Array).map(func(region: Dictionary) -> String: return region["path"]), ["South"])


func test_explains_a_region_without_geometry_under_it() -> void:
	_add_region("Navigation")
	_add_floor(_arena)
	var result: Dictionary = await _bake()
	var baked: Dictionary = (result["regions"] as Array)[0]
	assert_eq(baked["polygons"], 0)
	assert_string_contains(baked["reason"], "found no geometry under Navigation")


func test_explains_an_agent_too_large_for_the_floor() -> void:
	var large_agent := NavigationMesh.new()
	large_agent.agent_radius = 15.0
	_add_floor(_add_region("Navigation", large_agent))
	var result: Dictionary = await _bake()
	var baked: Dictionary = (result["regions"] as Array)[0]
	assert_eq(baked["polygons"], 0)
	assert_string_contains(baked["reason"], "an agent of radius 15")


func test_warns_about_a_cell_size_finer_than_the_navigation_map() -> void:
	var project_cell_size: Variant = ProjectSettings.get_setting(CELL_SIZE_SETTING)
	ProjectSettings.set_setting(CELL_SIZE_SETTING, 0.5)
	_add_floor(_add_region("Navigation"))
	var result: Dictionary = await _bake()
	ProjectSettings.set_setting(CELL_SIZE_SETTING, project_cell_size)
	var warnings: Array = ((result["regions"] as Array)[0] as Dictionary)["warnings"]
	assert_eq(warnings.size(), 1)
	assert_string_contains(warnings[0], "cell_size 0.25")
	assert_string_contains(warnings[0], "navigation/3d/default_cell_size 0.5")


func test_skips_a_region_without_a_navigation_mesh() -> void:
	_add_floor(_add_region("Navigation"))
	_add_region("Empty", null)
	var result: Dictionary = await _bake()
	assert_eq((result["regions"] as Array).size(), 1)
	assert_eq((result["skipped"] as Array).size(), 1)
	assert_eq(((result["skipped"] as Array)[0] as Dictionary)["path"], "Empty")
	assert_string_contains(((result["skipped"] as Array)[0] as Dictionary)["reason"], "NavigationMesh")


func test_explains_a_scene_without_regions_and_a_node_that_is_not_a_region() -> void:
	_add_floor(_arena)
	var no_regions: CommandError = await _bake()
	assert_eq(no_regions.code, JsonRpc.NOT_FOUND)
	assert_eq(no_regions.message, "res://arena.tscn has no NavigationRegion3D")
	var not_a_region: CommandError = await _bake({"path": "Floor"})
	assert_eq(not_a_region.code, JsonRpc.INVALID_PARAMS)
	assert_eq(not_a_region.message, "Floor is a StaticBody3D, not a NavigationRegion3D")
