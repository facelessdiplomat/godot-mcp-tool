extends "scene_edit.gd"

const SignalCatalog := preload("../signal_catalog.gd")

var _scene_root: Node
var _source: Node
var _target: Node
var _signal_name: String
var _method: String
var _binds: Array
var _flags: int
var _already_connected := false


func prepare(scene_root: Node, params: Dictionary) -> CommandError:
	var source_path: Variant = Params.required_text(params, "from", "\"Button\"")
	var signal_name: Variant = Params.required_text(params, "signal", "\"pressed\"")
	var target_path: Variant = Params.text(params, "to", ".")
	var method: Variant = Params.required_text(params, "method", "\"_on_button_pressed\"")
	var deferred: Variant = Params.flag(params, "deferred", false)
	var one_shot: Variant = Params.flag(params, "one_shot", false)
	for value in [source_path, signal_name, target_path, method, deferred, one_shot]:
		if value is CommandError:
			return value
	var binds: Variant = params.get("binds", [])
	if binds == null:
		binds = []
	if not binds is Array:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"binds\" must be a list of values", "Example: {\"binds\": [\"door_a\", 2]}")
	var source := NodeLocator.find(scene_root, source_path)
	if source == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % source_path, NodeLocator.not_found_hint(scene_root, source_path))
	var signal_description := SignalCatalog.find_signal(source, signal_name)
	if signal_description.is_empty():
		return CommandError.new(JsonRpc.NOT_FOUND, "%s has no signal \"%s\"" % [NodeFactory.display_class(source), signal_name], SignalCatalog.unknown_signal_hint(source, signal_name))
	var target := NodeLocator.find(scene_root, target_path)
	if target == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % target_path, NodeLocator.not_found_hint(scene_root, target_path))
	if not target.has_method(method):
		return CommandError.new(JsonRpc.NOT_FOUND, "%s has no method %s()" % [target.name, method], SignalCatalog.missing_method_hint(target, method, signal_description, binds))
	var arity_problem := SignalCatalog.arity_problem(target, method, signal_description, binds)
	if not arity_problem.is_empty():
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			arity_problem,
			"%s passes (%s); give the method matching parameters, such as %s" % [signal_name, SignalCatalog.arguments_text(signal_description), SignalCatalog.suggested_function(method, signal_description, binds)],
		)
	_scene_root = scene_root
	_source = source
	_target = target
	_signal_name = signal_name
	_method = method
	_binds = binds
	_flags = CONNECT_PERSIST | (CONNECT_DEFERRED if deferred else 0) | (CONNECT_ONE_SHOT if one_shot else 0)
	action_name = "MCP: Connect %s.%s to %s.%s" % [source.name, signal_name, target.name, method]
	var callable := Callable(target, method) if (binds as Array).is_empty() else Callable(target, method).bindv(binds)
	if source.is_connected(signal_name, callable):
		_already_connected = true
		return null
	changes.add_do_call(source, &"connect", [signal_name, callable, _flags])
	changes.add_undo_call(source, &"disconnect", [signal_name, callable])
	return null


func finish() -> Dictionary:
	return {
		"from": NodeLocator.path_of(_scene_root, _source),
		"signal": _signal_name,
		"to": NodeLocator.path_of(_scene_root, _target),
		"method": _method,
		"flags": SignalCatalog.flag_names(_flags),
		"binds": _context.codec.encode(_binds),
		"already_connected": _already_connected,
	}
