extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpNodeGetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/node/node_get_properties_command.gd")
const GodotMcpNodeSetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/node/node_set_properties_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpPropertyEditor := preload("res://addons/godot_mcp_tool/scene/property_editor.gd")
const GodotMcpResourceGetCommand := preload("res://addons/godot_mcp_tool/commands/resource/resource_get_command.gd")
const GodotMcpResourceSetPropertiesCommand := preload("res://addons/godot_mcp_tool/commands/resource/resource_set_properties_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const ScratchProject := preload("res://tests/support/scratch_project.gd")

const ORANGE_MATERIAL := "res://tests/fixtures/orange_material.tres"
const CRATE_SCENE := "res://tests/fixtures/crate.tscn"

var _scratch: ScratchProject
var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D
var _block: MeshInstance3D


func before_all() -> void:
	_scratch = ScratchProject.new()


func after_all() -> void:
	_scratch.remove()


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://levels/arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_block = MeshInstance3D.new()
	_block.name = "Block"
	_block.mesh = BoxMesh.new()
	_block.position = Vector3(1, 2, 3)
	_root.add_child(_block)
	_block.owner = _root


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _set_on_node(properties: Dictionary, path := "Block") -> Dictionary:
	return await GodotMcpNodeSetPropertiesCommand.new(_context).execute({"path": path, "properties": properties})


func test_reads_a_property_of_a_resource_by_its_path() -> void:
	var result: Dictionary = await GodotMcpNodeGetPropertiesCommand.new(_context).execute({"path": "Block", "names": ["mesh:size"]})
	assert_eq(result["properties"], [{"name": "mesh:size", "type": "Vector3", "value": "Vector3(1, 1, 1)"}])


func test_reads_one_part_of_a_value() -> void:
	var result: Dictionary = await GodotMcpNodeGetPropertiesCommand.new(_context).execute({"path": "Block", "names": ["position:y"]})
	assert_eq(result["properties"], [{"name": "position:y", "type": "float", "value": 2.0}])


func test_changes_a_property_of_a_built_in_resource_in_place() -> void:
	var mesh := _block.mesh
	var result: Dictionary = await _set_on_node({"mesh:size": [3, 1, 3]})
	assert_eq(result["applied"], ["mesh:size"])
	assert_eq(_block.mesh, mesh)
	assert_eq((mesh as BoxMesh).size, Vector3(3, 1, 3))
	assert_true(_history.undo())
	assert_eq((mesh as BoxMesh).size, Vector3(1, 1, 1))


func test_changes_one_part_of_a_value_and_keeps_the_others() -> void:
	var result: Dictionary = await _set_on_node({"position:y": 5})
	assert_eq(result["applied"], ["position:y"])
	assert_eq(_block.position, Vector3(1, 5, 3))
	assert_true(_history.undo())
	assert_eq(_block.position, Vector3(1, 2, 3))


func test_changes_several_parts_of_one_value_in_one_step() -> void:
	var result: Dictionary = await _set_on_node({"position:x": 7, "position:z": 9})
	assert_eq(result["applied"], ["position:x", "position:z"])
	assert_eq(_block.position, Vector3(7, 2, 9))
	assert_true(_history.undo())
	assert_eq(_block.position, Vector3(1, 2, 3))

func test_changes_paths_and_whole_properties_together() -> void:
	var result: Dictionary = await _set_on_node({"mesh:size": [2, 2, 2], "visible": false})
	assert_eq(result["applied"], ["mesh:size", "visible"])


func test_refuses_to_change_a_resource_file_in_place() -> void:
	_block.material_override = load(ORANGE_MATERIAL)
	var result: Dictionary = await _set_on_node({"material_override:albedo_color": "red"})
	assert_eq(result["applied"], [])
	var reason: String = (result["rejected"][0] as Dictionary)["reason"]
	assert_string_contains(reason, ORANGE_MATERIAL)
	assert_string_contains(reason, "resource_set_properties")
	assert_eq((_block.material_override as StandardMaterial3D).albedo_color, Color(1, 0.5, 0, 1))


func test_refuses_to_change_a_resource_of_an_instanced_scene_in_place() -> void:
	var crate := (load(CRATE_SCENE) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	crate.name = "Crate"
	_root.add_child(crate)
	crate.owner = _root
	var result: Dictionary = await _set_on_node({"mesh:size": [5, 5, 5]}, "Crate/Mesh")
	var reason: String = (result["rejected"][0] as Dictionary)["reason"]
	assert_string_contains(reason, CRATE_SCENE)
	assert_string_contains(reason, "{\"new\"")
	assert_eq(((crate.get_node("Mesh") as MeshInstance3D).mesh as BoxMesh).size, Vector3(1, 1, 1))


func test_says_how_to_fill_an_empty_resource_before_changing_it() -> void:
	var result: Dictionary = await _set_on_node({"material_override:albedo_color": "red"})
	var reason: String = (result["rejected"][0] as Dictionary)["reason"]
	assert_string_contains(reason, "material_override is empty")
	assert_string_contains(reason, "{\"new\"")


func test_suggests_a_similar_name_for_a_wrong_part_of_a_path() -> void:
	var result: Dictionary = await _set_on_node({"mesh:sise": [2, 2, 2]})
	var reason: String = (result["rejected"][0] as Dictionary)["reason"]
	assert_string_contains(reason, "size")


func test_rejects_a_part_that_a_value_does_not_have() -> void:
	var result: Dictionary = await _set_on_node({"position:w": 1})
	var reason: String = (result["rejected"][0] as Dictionary)["reason"]
	assert_string_contains(reason, "w")
	assert_eq(_block.position, Vector3(1, 2, 3))


func test_changes_a_sub_resource_of_a_resource_file() -> void:
	var material := StandardMaterial3D.new()
	material.next_pass = StandardMaterial3D.new()
	var path := _scratch.path("materials/layered.tres")
	ResourceSaver.save(material, path)
	var result: Dictionary = await GodotMcpResourceSetPropertiesCommand.new(_context).execute({"path": path, "properties": {"next_pass:albedo_color": "red"}})
	var read: Dictionary = await GodotMcpResourceGetCommand.new(_context).execute({"path": path, "names": ["next_pass:albedo_color"]})
	assert_eq(result["applied"], ["next_pass:albedo_color"])
	assert_eq((read["properties"] as Array)[0]["value"], "Color(1, 0, 0, 1)")


func test_the_running_game_changes_any_resource_by_its_path() -> void:
	_block.material_override = load(ORANGE_MATERIAL).duplicate()
	var report := GodotMcpPropertyEditor.new(GodotMcpVariantCodec.new()).assign(_block, {"material_override:albedo_color": "red"})
	assert_eq(report["applied"], ["material_override:albedo_color"])
	assert_eq((_block.material_override as StandardMaterial3D).albedo_color, Color(1, 0, 0, 1))
