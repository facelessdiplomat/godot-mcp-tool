extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpResourceFactory := preload("../../resources/resource_factory.gd")
const GodotMcpResourceFiles := preload("../../resources/resource_files.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = GodotMcpParams.required_text(params, "path", "\"res://materials/ice.tres\"")
	var type_name: Variant = GodotMcpParams.required_text(params, "type", "\"PhysicsMaterial\"")
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [resource_path, type_name, properties]:
		if value is GodotMcpCommandError:
			return value
	var path_error := GodotMcpResourceFiles.validate_new_path(resource_path)
	if path_error != null:
		return path_error
	var created: Variant = GodotMcpResourceFactory.create(type_name)
	if created is GodotMcpCommandError:
		return created
	var resource := created as Resource
	var report := _context.properties.assign(resource, properties)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path((resource_path as String).get_base_dir()))
	var save_error := ResourceSaver.save(resource, resource_path)
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [resource_path, error_string(save_error)])
	return {
		"path": resource_path,
		"type": GodotMcpNodeFactory.display_class(resource),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
