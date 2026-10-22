extends "../../commands/command.gd"

const GameScene := preload("game_scene.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../../commands/params.gd")
const PropertyEditor := preload("../../scene/property_editor.gd")
const SimilarNames := preload("../../util/similar_names.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

const CALL_SUFFIX := "()"
const GETTER_PREFIXES := ["is_", "get_", "has_", "can_"]

var _scene: GameScene
var _properties: PropertyEditor
var _codec: VariantCodec


func _init(scene: GameScene, properties: PropertyEditor, codec: VariantCodec) -> void:
	_scene = scene
	_properties = properties
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var path: Variant = Params.required_text(params, "path", "\"Player\", \".\" for the current scene, or \"/root/GameState\"")
	var names: Variant = Params.text_list(params, "names")
	var include_defaults: Variant = Params.flag(params, "include_defaults", false)
	for value in [path, names, include_defaults]:
		if value is CommandError:
			return value
	var resolved: Variant = _scene.resolve(path)
	if resolved is CommandError:
		return resolved
	var node := resolved as Node
	var entries: Array = []
	if (names as Array).is_empty():
		entries = _properties.describe(node, PackedStringArray(), include_defaults)
	for requested_name in names:
		if (requested_name as String).ends_with(CALL_SUFFIX):
			entries.append(_call_getter(node, requested_name))
		else:
			entries.append_array(_properties.describe(node, PackedStringArray([requested_name]), false))
	return {"scene": _scene.scene_path(), "path": _scene.path_of(node), "type": NodeFactory.display_class(node), "properties": entries}


func _call_getter(node: Node, call_text: String) -> Dictionary:
	var method_name := call_text.trim_suffix(CALL_SUFFIX)
	if not _is_getter_name(method_name):
		return {"name": call_text, "error": "Only methods whose names start with is_, get_, has_ or can_ can be read this way."}
	var method := _method_named(node, method_name)
	if method.is_empty():
		return {"name": call_text, "error": _unknown_method_message(node, method_name)}
	var required_arguments := (method["args"] as Array).size() - (method["default_args"] as Array).size()
	if required_arguments > 0:
		return {"name": call_text, "error": "%s() needs %d argument(s), so it cannot be read like a property." % [method_name, required_arguments]}
	var value: Variant = node.call(method_name)
	return {"name": call_text, "type": type_string(typeof(value)), "value": _codec.encode(value)}


static func _is_getter_name(method_name: String) -> bool:
	return GETTER_PREFIXES.any(func(prefix: String) -> bool: return method_name.begins_with(prefix))


static func _method_named(object: Object, method_name: String) -> Dictionary:
	for method in object.get_method_list():
		if method["name"] == method_name:
			return method
	return {}


static func _unknown_method_message(object: Object, method_name: String) -> String:
	var getter_names: Array = []
	for method in object.get_method_list():
		if _is_getter_name(str(method["name"])):
			getter_names.append(str(method["name"]))
	var message := "%s has no method %s()." % [object.get_class(), method_name]
	var similar := SimilarNames.hint(method_name, getter_names)
	return message if similar.is_empty() else "%s %s" % [message, similar]
