extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGetterReader := preload("../../scene/getter_reader.gd")
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
	var result := {
		"path": resource_path,
		"type": GodotMcpNodeFactory.display_class(resource),
		"properties": _entries(resource, names, include_defaults),
		"dependencies": GodotMcpResourceFiles.dependencies_of(resource_path),
	}
	if resource is Texture2D:
		var size := (resource as Texture2D).get_size()
		result["size"] = [int(size.x), int(size.y)]
	return result


func _entries(resource: Resource, names: Array, include_defaults: bool) -> Array:
	if names.is_empty():
		return _context.properties.describe(resource, PackedStringArray(), include_defaults)
	var getters := GodotMcpGetterReader.new(_context.codec)
	var entries: Array = []
	for requested_name in names:
		if GodotMcpGetterReader.is_call(requested_name):
			entries.append(getters.read(resource, requested_name))
		else:
			entries.append_array(_context.properties.describe(resource, PackedStringArray([requested_name]), false))
	return entries
