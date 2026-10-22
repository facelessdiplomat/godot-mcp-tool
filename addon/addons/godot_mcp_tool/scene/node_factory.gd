extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const SimilarNames := preload("../util/similar_names.gd")

const TYPE_EXAMPLES := "Use a node class such as Node3D, MeshInstance3D or CharacterBody3D, a class_name from the project, or a scene path such as res://props/crate.tscn."


func create(type_text: String) -> Variant:
	if type_text.begins_with("res://") or type_text.begins_with("uid://"):
		return _instantiate_scene(type_text, PackedScene.GEN_EDIT_STATE_INSTANCE)
	if ClassDB.class_exists(type_text):
		return _instantiate_engine_class(type_text)
	var script := _global_script(type_text)
	if script != null:
		return _instantiate_script(type_text, script)
	return CommandError.new(JsonRpc.NOT_FOUND, "Unknown node type %s" % type_text, unknown_type_hint(type_text))


static func display_class_of_scene(packed_scene: PackedScene) -> String:
	var state := packed_scene.get_state()
	while state != null and state.get_node_count() > 0:
		var root_type := str(state.get_node_type(0))
		if not root_type.is_empty():
			return root_type
		var root_instance := state.get_node_instance(0)
		state = root_instance.get_state() if root_instance != null else state.get_base_scene_state()
	return "Node"


static func is_known_class(class_text: String) -> bool:
	return ClassDB.class_exists(class_text) or _global_script(class_text) != null


static func display_class(object: Object) -> String:
	var script := object.get_script() as Script
	if script != null and not script.get_global_name().is_empty():
		return script.get_global_name()
	return object.get_class()


static func unknown_type_hint(type_text: String) -> String:
	var candidates: Array = Array(ClassDB.get_inheriters_from_class("Node"))
	for global_class in ProjectSettings.get_global_class_list():
		candidates.append(global_class["class"])
	var similar := SimilarNames.hint(type_text, candidates)
	return similar if not similar.is_empty() else TYPE_EXAMPLES


func _instantiate_scene(scene_path: String, edit_state: int) -> Variant:
	if not ResourceLoader.exists(scene_path):
		return CommandError.new(JsonRpc.NOT_FOUND, "Scene %s not found" % scene_path, "Check the path with scene_get_tree or the file system.")
	var packed_scene := load(scene_path) as PackedScene
	if packed_scene == null or not packed_scene.can_instantiate():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is not a scene that can be instanced" % scene_path)
	return packed_scene.instantiate(edit_state)


func _instantiate_engine_class(class_text: String) -> Variant:
	if not ClassDB.is_parent_class(class_text, "Node"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is not a node class" % class_text, TYPE_EXAMPLES)
	if not ClassDB.can_instantiate(class_text):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is abstract and cannot be created" % class_text, "Use one of its subclasses: %s." % ", ".join(ClassDB.get_inheriters_from_class(class_text).slice(0, 5)))
	return ClassDB.instantiate(class_text)


func _instantiate_script(type_text: String, script: Script) -> Variant:
	if not ClassDB.is_parent_class(script.get_instance_base_type(), "Node"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is not a node class" % type_text, TYPE_EXAMPLES)
	if not script.can_instantiate():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s cannot be created; check its script for errors" % type_text)
	return script.new()


static func _global_script(type_text: String) -> Script:
	for global_class in ProjectSettings.get_global_class_list():
		if global_class["class"] == type_text:
			return load(global_class["path"]) as Script
	return null
