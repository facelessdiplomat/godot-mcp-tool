extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const SceneAccess := preload("scene_access.gd")
const SceneSnapshot := preload("scene_snapshot.gd")

var access: SceneAccess


func _init(scene_access: SceneAccess) -> void:
	access = scene_access


func resolve_for_editing(scene_path: String) -> Variant:
	if scene_path.is_empty():
		var edited_root := access.edited_scene_root()
		return edited_root if edited_root != null else _no_scene_error()
	var path_error := validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	var open_root := find_open_root(scene_path)
	if open_root != null:
		return open_root
	if not ResourceLoader.exists(scene_path):
		return missing_scene_error(scene_path)
	var open_error := access.open_scene(scene_path)
	if open_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not open %s: %s" % [scene_path, error_string(open_error)])
	var opened_root := find_open_root(scene_path)
	return opened_root if opened_root != null else access.edited_scene_root()


func resolve_for_reading(scene_path: String) -> Variant:
	if scene_path.is_empty():
		var edited_root := access.edited_scene_root()
		if edited_root == null:
			return _no_scene_error()
		return SceneSnapshot.new(edited_root, edited_root.scene_file_path, false)
	var path_error := validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	var open_root := find_open_root(scene_path)
	if open_root != null:
		return SceneSnapshot.new(open_root, scene_path, false)
	if not ResourceLoader.exists(scene_path):
		return missing_scene_error(scene_path)
	var packed_scene := load(scene_path) as PackedScene
	if packed_scene == null or not packed_scene.can_instantiate():
		return CommandError.new(JsonRpc.OPERATION_FAILED, "%s could not be loaded as a scene" % scene_path)
	return SceneSnapshot.new(packed_scene.instantiate(PackedScene.GEN_EDIT_STATE_MAIN), scene_path, true)


func find_open_root(scene_path: String) -> Node:
	for root in access.open_scene_roots():
		if root.scene_file_path == scene_path:
			return root
	return null


static func validate_scene_path(scene_path: String) -> CommandError:
	if not scene_path.begins_with("res://") or not (scene_path.ends_with(".tscn") or scene_path.ends_with(".scn")):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" is not a scene path" % scene_path, "Scene paths look like res://levels/arena.tscn.")
	return null


static func missing_scene_error(scene_path: String) -> CommandError:
	return CommandError.new(JsonRpc.NOT_FOUND, "Scene %s not found" % scene_path, "Create it with scene_create, or check the path.")


static func _no_scene_error() -> CommandError:
	return CommandError.new(JsonRpc.NO_SCENE, "No scene is open in the editor", "Pass \"scene\" with a res:// path, open one with scene_open, or create one with scene_create.")
