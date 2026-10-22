extends "../command.gd"

const ChangeSet := preload("../../scene/change_set.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../params.gd")
const ResourceFiles := preload("../../resources/resource_files.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var resource_path: Variant = Params.required_text(params, "path", "\"res://materials/ice.tres\"")
	var properties: Variant = Params.dictionary(params, "properties")
	for value in [resource_path, properties]:
		if value is CommandError:
			return value
	if (properties as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"friction\": 0.1}")
	var loaded: Variant = ResourceFiles.load_changeable(resource_path)
	if loaded is CommandError:
		return loaded
	var resource := loaded as Resource
	var planned := _context.properties.plan(resource, properties)
	var changes: ChangeSet = planned["changes"]
	if not changes.is_empty():
		_context.history.record("MCP: Set properties of %s" % (resource_path as String).get_file(), resource, [changes])
		var save_error := ResourceSaver.save(resource, resource_path)
		if save_error != OK:
			return CommandError.new(JsonRpc.OPERATION_FAILED, "Changed %s in the editor, but could not save it: %s" % [resource_path, error_string(save_error)], "Check that the file can be written.")
	var report := _context.properties.report(resource, planned["decoded"], planned["rejected"])
	return {
		"path": resource_path,
		"type": NodeFactory.display_class(resource),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
