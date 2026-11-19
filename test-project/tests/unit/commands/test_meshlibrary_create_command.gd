extends GutTest

const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpMeshLibraryCreateCommand := preload("res://addons/godot_mcp_tool/commands/grid/meshlibrary_create_command.gd")
const GodotMcpMeshPreviewAccess := preload("res://addons/godot_mcp_tool/editor/mesh_preview_access.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

var _scratch_directory := ""
var _command: GodotMcpMeshLibraryCreateCommand


func before_each() -> void:
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))
	_command = GodotMcpMeshLibraryCreateCommand.new(GodotMcpMeshPreviewAccess.new())


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _scratch_path(file_name: String) -> String:
	return _scratch_directory.path_join(file_name)


func _save_blocks(block_names: Array) -> String:
	var root := Node3D.new()
	root.name = "Blocks"
	for index in block_names.size():
		var block := MeshInstance3D.new()
		block.name = block_names[index]
		block.mesh = BoxMesh.new()
		block.position = Vector3(index * 3, 0, 0)
		var body := StaticBody3D.new()
		var shape := CollisionShape3D.new()
		shape.shape = BoxShape3D.new()
		body.add_child(shape)
		block.add_child(body)
		root.add_child(block)
		block.owner = root
		body.owner = root
		shape.owner = root
	var packed := PackedScene.new()
	packed.pack(root)
	root.free()
	var path := _scratch_path("blocks.tscn")
	ResourceSaver.save(packed, path)
	return path


func test_creates_a_library_with_an_item_for_each_block_of_the_scene() -> void:
	var scene_path := _save_blocks(["Grass", "Stone"])
	var library_path := _scratch_path("blocks.tres")

	var created: Variant = _command.execute({"scene": scene_path, "path": library_path})

	assert_eq(created["created"], true)
	assert_eq((created["items"] as Array).map(func(item: Dictionary) -> Array: return [item["id"], item["name"], item["shapes"]]), [[0, "Grass", 1], [1, "Stone", 1]])
	assert_eq(created["previews"], false)
	var library := ResourceLoader.load(library_path, "", ResourceLoader.CACHE_MODE_IGNORE) as MeshLibrary
	assert_eq(library.get_item_list(), PackedInt32Array([0, 1]))
	assert_eq(library.get_item_shapes(1).size(), 2)
	assert_eq(library.get_meta("_editor_source_scene"), scene_path)


func test_keeps_the_ids_of_the_items_when_it_updates_a_library() -> void:
	var library_path := _scratch_path("blocks.tres")
	_command.execute({"scene": _save_blocks(["Grass", "Stone"]), "path": library_path})

	var updated: Variant = _command.execute({"scene": _save_blocks(["Lava", "Stone"]), "path": library_path, "update": true})

	assert_eq(updated["created"], false)
	assert_eq((updated["items"] as Array).map(func(item: Dictionary) -> Array: return [item["id"], item["name"], item["added"]]), [[2, "Lava", true], [1, "Stone", false]])
	assert_eq(updated["left"], [{"id": 0, "name": "Grass"}])


func test_refuses_to_replace_a_library_without_update() -> void:
	var scene_path := _save_blocks(["Grass"])
	var library_path := _scratch_path("blocks.tres")
	_command.execute({"scene": scene_path, "path": library_path})

	var refused: Variant = _command.execute({"scene": scene_path, "path": library_path})

	assert_true(refused is GodotMcpCommandError)
	assert_string_contains((refused as GodotMcpCommandError).message, "already exists")
	assert_string_contains((refused as GodotMcpCommandError).hint, "update")


func test_refuses_a_scene_without_blocks() -> void:
	var refused: Variant = _command.execute({"scene": _save_blocks([]), "path": _scratch_path("blocks.tres")})

	assert_true(refused is GodotMcpCommandError)
	assert_string_contains((refused as GodotMcpCommandError).message, "no MeshInstance3D with a mesh")


func test_refuses_a_path_that_is_not_a_library_file() -> void:
	var refused: Variant = _command.execute({"scene": _save_blocks(["Grass"]), "path": _scratch_path("blocks.png")})

	assert_true(refused is GodotMcpCommandError)
	assert_eq((refused as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
