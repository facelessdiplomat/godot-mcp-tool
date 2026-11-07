extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpResourceFiles := preload("../../resources/resource_files.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = GodotMcpParams.required_text(params, "path", "\"res://materials/ice.tres\"")
	var names: Variant = GodotMcpParams.text_list(params, "names")
	var include_defaults: Variant = GodotMcpParams.flag(params, "include_defaults", false)
	for value in [resource_path, names, include_defaults]:
		if value is GodotMcpCommandError:
			return value
	var loaded: Variant = GodotMcpResourceFiles.load_existing(resource_path)
	if loaded is GodotMcpCommandError:
		return loaded
	var resource := loaded as Resource
	return {
		"path": resource_path,
		"type": GodotMcpNodeFactory.display_class(resource),
		"properties": _context.properties.describe(resource, PackedStringArray(names), include_defaults),
		"dependencies": GodotMcpResourceFiles.dependencies_of(resource_path),
	}
