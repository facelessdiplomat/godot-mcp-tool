extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpResourceFiles := preload("../../resources/resource_files.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = GodotMcpParams.required_text(params, "path", "\"res://materials/ice.tres\"")
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [resource_path, properties]:
		if value is GodotMcpCommandError:
			return value
	if (properties as Dictionary).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"friction\": 0.1}")
	var loaded: Variant = GodotMcpResourceFiles.load_changeable(resource_path)
	if loaded is GodotMcpCommandError:
		return loaded
	var resource := loaded as Resource
	var planned := _context.properties.plan(resource, properties)
	var changes: GodotMcpChangeSet = planned["changes"]
	if not changes.is_empty():
		_context.history.record("MCP: Set properties of %s" % (resource_path as String).get_file(), resource, [changes])
		var save_error := ResourceSaver.save(resource, resource_path)
		if save_error != OK:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Changed %s in the editor, but could not save it: %s" % [resource_path, error_string(save_error)], "Check that the file can be written.")
	var report := _context.properties.report(resource, planned["decoded"], planned["rejected"])
	return {
		"path": resource_path,
		"type": GodotMcpNodeFactory.display_class(resource),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
