extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../params.gd")
const ResourceFiles := preload("../../resources/resource_files.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = Params.required_text(params, "path", "\"res://materials/ice.tres\"")
	var names: Variant = Params.text_list(params, "names")
	var include_defaults: Variant = Params.flag(params, "include_defaults", false)
	for value in [resource_path, names, include_defaults]:
		if value is CommandError:
			return value
	var loaded: Variant = ResourceFiles.load_existing(resource_path)
	if loaded is CommandError:
		return loaded
	var resource := loaded as Resource
	return {
		"path": resource_path,
		"type": NodeFactory.display_class(resource),
		"properties": _context.properties.describe(resource, PackedStringArray(names), include_defaults),
		"dependencies": ResourceFiles.dependencies_of(resource_path),
	}
