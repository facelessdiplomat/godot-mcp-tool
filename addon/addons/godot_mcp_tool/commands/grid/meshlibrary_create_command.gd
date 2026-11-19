extends "../command.gd"

const GodotMcpMeshLibraryImport := preload("../../resources/mesh_library_import.gd")
const GodotMcpMeshPreviewAccess := preload("../../editor/mesh_preview_access.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpResourceFiles := preload("../../resources/resource_files.gd")

const LIBRARY_EXTENSIONS := ["tres", "res", "meshlib"]
const SCENE_EXTENSIONS := ["tscn", "scn"]
const SOURCE_SCENE_META := "_editor_source_scene"

var _previews: GodotMcpMeshPreviewAccess


func _init(previews: GodotMcpMeshPreviewAccess) -> void:
	_previews = previews


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.required_text(params, "scene", "\"res://blocks/blocks.tscn\"")
	var library_path: Variant = GodotMcpParams.required_text(params, "path", "\"res://blocks/blocks.tres\"")
	var update: Variant = GodotMcpParams.flag(params, "update", false)
	var apply_transforms: Variant = GodotMcpParams.flag(params, "apply_transforms", false)
	for value in [scene_path, library_path, update, apply_transforms]:
		if value is GodotMcpCommandError:
			return value
	var problem: Variant = _path_problem(scene_path, library_path)
	if problem != null:
		return problem
	var packed := ResourceLoader.load(scene_path) as PackedScene
	if packed == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is not a scene Godot can load" % scene_path, "Read its errors with game_get_output.")
	var exists := ResourceLoader.exists(library_path)
	if exists and not update:
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"%s already exists" % library_path,
			"Pass update: true to update it and keep the ids of its items, which the cells of a GridMap store, or give another path.",
		)
	var library: Variant = _library_at(library_path, exists)
	if library is GodotMcpCommandError:
		return library
	var scene := packed.instantiate(PackedScene.GEN_EDIT_STATE_DISABLED)
	var planned := GodotMcpMeshLibraryImport.plan(scene, apply_transforms)
	scene.free()
	if (planned["items"] as Array).is_empty():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.INVALID_PARAMS,
			"%s has no MeshInstance3D with a mesh, so there is no block to add" % scene_path,
			"Each block of the scene is a MeshInstance3D with a mesh, with a StaticBody3D child for its collision, such as Grass/StaticBody3D/CollisionShape3D.",
		)
	var applied := GodotMcpMeshLibraryImport.apply(library, planned["items"])
	var previews := _previews.add_previews(library, (applied["items"] as Array).map(func(item: Dictionary) -> int: return item["id"]))
	(library as MeshLibrary).set_meta(SOURCE_SCENE_META, scene_path)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path((library_path as String).get_base_dir()))
	var save_error := ResourceSaver.save(library, library_path)
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [library_path, error_string(save_error)])
	return {
		"path": library_path,
		"scene": scene_path,
		"created": not exists,
		"items": applied["items"],
		"left": applied["left"],
		"duplicates": planned["duplicates"],
		"previews": previews,
	}


static func _path_problem(scene_path: String, library_path: String) -> Variant:
	for path in [scene_path, library_path]:
		var location_error := GodotMcpResourceFiles.validate_location(path)
		if location_error != null:
			return location_error
	if not library_path.get_extension() in LIBRARY_EXTENSIONS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "A MeshLibrary is saved as a .tres, .res or .meshlib file, not %s" % library_path, "Example: \"res://blocks/blocks.tres\"")
	if not scene_path.get_extension() in SCENE_EXTENSIONS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is not a scene file" % scene_path, "Give the scene of the blocks, such as \"res://blocks/blocks.tscn\".")
	if not ResourceLoader.exists(scene_path):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "There is no scene at %s" % scene_path, "Save the scene of the blocks first, such as with scene_create and scene_save.")
	return null


static func _library_at(library_path: String, exists: bool) -> Variant:
	if not exists:
		return MeshLibrary.new()
	var loaded := ResourceLoader.load(library_path)
	if not loaded is MeshLibrary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is a %s, not a MeshLibrary" % [library_path, GodotMcpNodeFactory.display_class(loaded) if loaded != null else "file Godot cannot load"], "Give a new path to create a MeshLibrary there.")
	return loaded
