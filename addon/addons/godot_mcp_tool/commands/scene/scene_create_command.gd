extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../params.gd")
const SceneResolver := preload("../../scene/scene_resolver.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.required_text(params, "path", "\"res://levels/arena.tscn\"")
	var root_type: Variant = Params.required_text(params, "root_type", "\"Node3D\", or a scene path to inherit from")
	for value in [scene_path, root_type]:
		if value is CommandError:
			return value
	var path_error := SceneResolver.validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	if FileAccess.file_exists(scene_path) or ResourceLoader.exists(scene_path):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s already exists" % scene_path, "Open it with scene_open, or choose another path.")
	var root_name: Variant = Params.text(params, "root_name", (scene_path as String).get_file().get_basename().to_pascal_case())
	if root_name is CommandError:
		return root_name
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path((scene_path as String).get_base_dir()))
	var creation: Variant = _create_inherited_scene(root_type, root_name, scene_path) if _is_scene_reference(root_type) else _create_scene(root_type, root_name, scene_path)
	if creation is CommandError:
		return creation
	_context.scenes.access.register_new_file(scene_path)
	var open_error := _context.scenes.access.open_scene(scene_path)
	if open_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "%s was created but could not be opened: %s" % [scene_path, error_string(open_error)])
	return {"scene": scene_path, "root": {"name": str(root_name), "type": creation}}


static func _is_scene_reference(root_type: String) -> bool:
	return root_type.begins_with("res://") or root_type.begins_with("uid://")


func _create_scene(root_type: String, root_name: String, scene_path: String) -> Variant:
	var created: Variant = _context.nodes.create(root_type)
	if created is CommandError:
		return created
	var root := created as Node
	root.name = root_name
	var root_class := NodeFactory.display_class(root)
	var packed_scene := PackedScene.new()
	var pack_error := packed_scene.pack(root)
	root.free()
	if pack_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not pack the new scene: %s" % error_string(pack_error))
	var save_error := ResourceSaver.save(packed_scene, scene_path)
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [scene_path, error_string(save_error)])
	return root_class


func _create_inherited_scene(base_scene_path: String, root_name: String, scene_path: String) -> Variant:
	if not ResourceLoader.exists(base_scene_path):
		return SceneResolver.missing_scene_error(base_scene_path)
	var base_uid := ResourceLoader.get_resource_uid(base_scene_path)
	var uid_attribute := "" if base_uid == ResourceUID.INVALID_ID else " uid=\"%s\"" % ResourceUID.id_to_text(base_uid)
	var scene_text := "[gd_scene load_steps=2 format=3]\n\n[ext_resource type=\"PackedScene\"%s path=\"%s\" id=\"1_base\"]\n\n[node name=\"%s\" instance=ExtResource(\"1_base\")]\n" % [uid_attribute, base_scene_path, root_name]
	var file := FileAccess.open(scene_path, FileAccess.WRITE)
	if file == null:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not write %s: %s" % [scene_path, error_string(FileAccess.get_open_error())])
	file.store_string(scene_text)
	file.close()
	var packed_scene := ResourceLoader.load(scene_path, "PackedScene", ResourceLoader.CACHE_MODE_REPLACE) as PackedScene
	if packed_scene == null or not packed_scene.can_instantiate():
		DirAccess.remove_absolute(ProjectSettings.globalize_path(scene_path))
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not create a scene inherited from %s" % base_scene_path)
	return NodeFactory.display_class_of_scene(packed_scene)
