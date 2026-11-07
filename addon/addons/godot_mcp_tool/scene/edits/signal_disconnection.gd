extends "scene_edit.gd"

const GodotMcpSignalCatalog := preload("../signal_catalog.gd")

var _scene_root: Node
var _source: Node
var _target: Node
var _signal_name: String
var _method: String


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var source_path: Variant = GodotMcpParams.required_text(params, "from", "\"Button\"")
	var signal_name: Variant = GodotMcpParams.required_text(params, "signal", "\"pressed\"")
	var target_path: Variant = GodotMcpParams.text(params, "to", ".")
	var method: Variant = GodotMcpParams.required_text(params, "method", "\"_on_button_pressed\"")
	for value in [source_path, signal_name, target_path, method]:
		if value is GodotMcpCommandError:
			return value
	var source := GodotMcpNodeLocator.find(scene_root, source_path)
	if source == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % source_path, GodotMcpNodeLocator.not_found_hint(scene_root, source_path))
	if GodotMcpSignalCatalog.find_signal(source, signal_name).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no signal \"%s\"" % [GodotMcpNodeFactory.display_class(source), signal_name], GodotMcpSignalCatalog.unknown_signal_hint(source, signal_name))
	var target := GodotMcpNodeLocator.find(scene_root, target_path)
	if target == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % target_path, GodotMcpNodeLocator.not_found_hint(scene_root, target_path))
	var connection := _find_connection(source, signal_name, target, method)
	if connection.is_empty():
		return GodotMcpCommandError.new(
			GodotMcpJsonRpc.NOT_FOUND,
			"%s.%s is not connected to %s.%s()" % [source.name, signal_name, target.name, method],
			"signal_list with path \"%s\" shows the connections of its signals." % source_path,
		)
	_scene_root = scene_root
	_source = source
	_target = target
	_signal_name = signal_name
	_method = method
	action_name = "MCP: Disconnect %s.%s from %s.%s" % [source.name, signal_name, target.name, method]
	var callable: Callable = connection["callable"]
	changes.add_do_call(source, &"disconnect", [signal_name, callable])
	changes.add_undo_call(source, &"connect", [signal_name, callable, int(connection["flags"])])
	return null


func finish() -> Dictionary:
	return {
		"from": GodotMcpNodeLocator.path_of(_scene_root, _source),
		"signal": _signal_name,
		"to": GodotMcpNodeLocator.path_of(_scene_root, _target),
		"method": _method,
	}


static func _find_connection(source: Node, signal_name: String, target: Node, method: String) -> Dictionary:
	for connection in GodotMcpSignalCatalog.saved_connections(source, signal_name):
		var callable: Callable = connection["callable"]
		if callable.get_object() == target and str(callable.get_method()) == method:
			return connection
	return {}
