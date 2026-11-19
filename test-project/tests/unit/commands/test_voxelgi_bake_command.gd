extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const GodotMcpVoxelGiBakeCommand := preload("res://addons/godot_mcp_tool/commands/lighting/voxelgi_bake_command.gd")
const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const FakeVoxelGiBaker := preload("res://tests/support/fake_voxel_gi_baker.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

var _scratch_directory := ""
var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _baker: FakeVoxelGiBaker
var _cave: Node3D


func before_each() -> void:
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))
	_scenes = FakeSceneAccess.new()
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_baker = FakeVoxelGiBaker.new()
	_cave = Node3D.new()
	_cave.name = "Cave"
	_cave.scene_file_path = _scratch_directory.path_join("cave.tscn")
	add_child(_cave)
	_scenes.edited_root = _cave


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _bake(params: Dictionary = {}) -> Variant:
	return await GodotMcpVoxelGiBakeCommand.new(_context, _baker).execute(params)


func _add(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _cave
	return node


func _add_voxel_gi(parent: Node, node_name: String) -> VoxelGI:
	var voxel_gi: VoxelGI = _add(parent, VoxelGI.new(), node_name)
	voxel_gi.size = Vector3(10, 6, 14)
	return voxel_gi


func _paths_of(baked: Array) -> Array:
	return baked.map(func(entry: Dictionary) -> String: return entry["path"])


func test_bakes_every_voxel_gi_into_a_file_next_to_the_scene_as_one_undo_step() -> void:
	var voxel_gi := _add_voxel_gi(_cave, "VoxelGI")

	var result: Dictionary = await _bake()

	var data_path := _scratch_directory.path_join("cave.VoxelGI_data.res")
	assert_eq(result["scene"], _cave.scene_file_path)
	assert_eq(result["baked"], [{"path": "VoxelGI", "data": data_path, "bytes": 8, "subdiv": 128, "size": [10.0, 6.0, 14.0], "geometry": true, "warnings": []}])
	assert_eq(voxel_gi.data.resource_path, data_path)
	assert_eq(_history.last_action_name(), "MCP: Bake VoxelGI")
	assert_true(_history.undo())
	assert_null(voxel_gi.data)
	assert_true(_history.redo())
	assert_eq(voxel_gi.data.resource_path, data_path)


func test_bakes_only_the_named_voxel_gi() -> void:
	_add_voxel_gi(_cave, "Hall")
	_add_voxel_gi(_add(_cave, Node3D.new(), "Cellar"), "Light")

	var every: Dictionary = await _bake()
	var named: Dictionary = await _bake({"path": "Cellar/Light"})

	assert_eq(_paths_of(every["baked"]), ["Hall", "Cellar/Light"])
	assert_eq(_paths_of(named["baked"]), ["Cellar/Light"])


func test_keeps_the_file_that_holds_the_data_already() -> void:
	var voxel_gi := _add_voxel_gi(_cave, "VoxelGI")
	var data := VoxelGIData.new()
	data.take_over_path(_scratch_directory.path_join("lighting/cave_gi.res"))
	voxel_gi.data = data

	var result: Dictionary = await _bake()

	assert_eq((result["baked"] as Array)[0]["data"], _scratch_directory.path_join("lighting/cave_gi.res"))
	assert_same(voxel_gi.data, data)


func test_gives_voxel_gis_of_the_same_name_their_own_files() -> void:
	_add_voxel_gi(_cave, "VoxelGI")
	_add_voxel_gi(_add(_cave, Node3D.new(), "Cellar"), "VoxelGI")

	var result: Dictionary = await _bake()

	assert_eq((result["baked"] as Array).map(func(entry: Dictionary) -> String: return entry["data"]), [
		_scratch_directory.path_join("cave.VoxelGI_data.res"),
		_scratch_directory.path_join("cave.VoxelGI2_data.res"),
	])


func test_gives_a_voxel_gi_that_shared_its_data_a_file_of_its_own() -> void:
	var first := _add_voxel_gi(_cave, "Hall")
	var second := _add_voxel_gi(_cave, "Cellar")
	var shared := VoxelGIData.new()
	shared.take_over_path(_scratch_directory.path_join("shared_gi.res"))
	first.data = shared
	second.data = shared

	var result: Dictionary = await _bake()

	assert_eq((result["baked"] as Array).map(func(entry: Dictionary) -> String: return entry["data"]), [
		_scratch_directory.path_join("shared_gi.res"),
		_scratch_directory.path_join("cave.Cellar_data.res"),
	])
	assert_same(first.data, shared)
	assert_ne(second.data, shared)


func test_says_when_a_voxel_gi_found_no_static_geometry_in_its_box() -> void:
	_add_voxel_gi(_cave, "VoxelGI")
	_baker.finds_geometry = false

	var result: Dictionary = await _bake()

	assert_eq((result["baked"] as Array)[0]["geometry"], false)


func test_refuses_where_the_baker_cannot_bake() -> void:
	_add_voxel_gi(_cave, "VoxelGI")
	_baker.refusal_error = GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Baking a VoxelGI needs the editor with a window")

	var refused: Variant = await _bake()

	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).message, "Baking a VoxelGI needs the editor with a window")
	assert_eq(_baker.baked, [])


func test_sends_lightmaps_and_occluders_to_the_buttons_of_the_editor() -> void:
	_add(_cave, LightmapGI.new(), "Lightmap")
	_add(_cave, OccluderInstance3D.new(), "Occluder")

	var lightmap: Variant = await _bake({"path": "Lightmap"})
	var occluder: Variant = await _bake({"path": "Occluder"})
	var nothing_to_bake: Variant = await _bake()

	assert_string_contains((lightmap as GodotMcpCommandError).message, "LightmapGI")
	assert_string_contains((lightmap as GodotMcpCommandError).hint, "Bake Lightmaps")
	assert_string_contains((occluder as GodotMcpCommandError).hint, "Bake Occluders")
	assert_string_contains((nothing_to_bake as GodotMcpCommandError).message, "has no VoxelGI")
	assert_string_contains((nothing_to_bake as GodotMcpCommandError).hint, "Bake Lightmaps")


func test_refuses_a_scene_without_voxel_gi_a_node_of_another_class_and_an_unsaved_scene() -> void:
	_add(_cave, MeshInstance3D.new(), "Rock")

	var empty: Variant = await _bake()
	var rock: Variant = await _bake({"path": "Rock"})
	var missing: Variant = await _bake({"path": "Torch"})
	_cave.scene_file_path = ""
	_add_voxel_gi(_cave, "VoxelGI")
	var unsaved: Variant = await _bake()

	assert_string_contains((empty as GodotMcpCommandError).hint, "node_add")
	assert_string_contains((rock as GodotMcpCommandError).message, "not a VoxelGI")
	assert_eq((missing as GodotMcpCommandError).code, GodotMcpJsonRpc.NOT_FOUND)
	assert_string_contains((unsaved as GodotMcpCommandError).hint, "scene_save")


func test_reports_a_file_it_could_not_save() -> void:
	_add_voxel_gi(_cave, "VoxelGI")
	_baker.save_error = ERR_FILE_CANT_WRITE

	var failed: Variant = await _bake()

	assert_true(failed is GodotMcpCommandError)
	assert_string_contains((failed as GodotMcpCommandError).message, "cave.VoxelGI_data.res")
	assert_eq(_history.last_action_name(), "")
