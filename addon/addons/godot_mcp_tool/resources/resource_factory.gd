extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const GlobalClasses := preload("../util/global_classes.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const SimilarNames := preload("../util/similar_names.gd")

const TYPE_EXAMPLES := "Use a resource class such as StandardMaterial3D, PhysicsMaterial or Curve, or a class_name of the project that extends Resource."
const SUBCLASSES_SHOWN := 12


static func instantiate(type_name: String) -> Resource:
	if ClassDB.class_exists(type_name):
		if ClassDB.can_instantiate(type_name) and ClassDB.is_parent_class(type_name, "Resource"):
			return ClassDB.instantiate(type_name) as Resource
		return null
	var script := GlobalClasses.script_of(type_name)
	if script != null and ClassDB.is_parent_class(script.get_instance_base_type(), "Resource"):
		return GlobalClasses.instantiate(script) as Resource
	return null


static func create(type_name: String) -> Variant:
	if ClassDB.class_exists(type_name) and ClassDB.is_parent_class(type_name, "PackedScene"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Scenes are not created as resources", "Create a scene with scene_create.")
	if ClassDB.class_exists(type_name) and ClassDB.is_parent_class(type_name, "Script"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Scripts are not created as resources", "Write .gd files with your own file tools.")
	var resource := instantiate(type_name)
	if resource != null:
		return resource
	if ClassDB.class_exists(type_name):
		return _engine_class_error(type_name)
	var script := GlobalClasses.script_of(type_name)
	if script != null:
		if not ClassDB.is_parent_class(script.get_instance_base_type(), "Resource"):
			return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is not a resource class" % type_name, TYPE_EXAMPLES)
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s cannot be created; check its script for errors" % type_name)
	var candidates: Array = Array(ClassDB.get_inheriters_from_class("Resource")) + GlobalClasses.names()
	var similar := SimilarNames.hint(type_name, candidates)
	return CommandError.new(JsonRpc.NOT_FOUND, "Unknown resource type %s" % type_name, similar if not similar.is_empty() else TYPE_EXAMPLES)


static func _engine_class_error(type_name: String) -> CommandError:
	if not ClassDB.is_parent_class(type_name, "Resource"):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is not a resource class" % type_name, TYPE_EXAMPLES)
	var subclasses := _creatable_subclasses(type_name)
	var shown := ", ".join(subclasses.slice(0, SUBCLASSES_SHOWN))
	if subclasses.size() > SUBCLASSES_SHOWN:
		shown += ", …"
	return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is abstract and cannot be created" % type_name, "Use one of its subclasses: %s." % shown)


static func _creatable_subclasses(type_name: String) -> PackedStringArray:
	var subclasses := PackedStringArray()
	for inheriter in ClassDB.get_inheriters_from_class(type_name):
		if ClassDB.can_instantiate(inheriter) and not inheriter.begins_with("Placeholder"):
			subclasses.append(inheriter)
	subclasses.sort()
	return subclasses
