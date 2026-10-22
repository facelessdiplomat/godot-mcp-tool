extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../params.gd")
const ResourceFactory := preload("../../resources/resource_factory.gd")
const ResourceFiles := preload("../../resources/resource_files.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = Params.required_text(params, "path", "\"res://materials/ice.tres\"")
	var type_name: Variant = Params.required_text(params, "type", "\"PhysicsMaterial\"")
	var properties: Variant = Params.dictionary(params, "properties")
	for value in [resource_path, type_name, properties]:
		if value is CommandError:
			return value
	var path_error := ResourceFiles.validate_new_path(resource_path)
	if path_error != null:
		return path_error
	var created: Variant = ResourceFactory.create(type_name)
	if created is CommandError:
		return created
	var resource := created as Resource
	var report := _context.properties.assign(resource, properties)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path((resource_path as String).get_base_dir()))
	var save_error := ResourceSaver.save(resource, resource_path)
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [resource_path, error_string(save_error)])
	return {
		"path": resource_path,
		"type": NodeFactory.display_class(resource),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
