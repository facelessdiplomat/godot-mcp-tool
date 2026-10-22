extends "../../commands/command.gd"

const GameScene := preload("game_scene.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../../commands/params.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

const EXPRESSION_HINT := "Write one expression, such as position.y or get_tree().get_nodes_in_group(\"enemies\").size(); an assignment is not an expression, so call set(\"name\", value) instead."

var _scene: GameScene
var _codec: VariantCodec


func _init(scene: GameScene, codec: VariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var expression_text: Variant = Params.required_text(params, "expression", "\"position.y\"")
	var node_path: Variant = Params.text(params, "node", ".")
	for value in [expression_text, node_path]:
		if value is CommandError:
			return value
	var node: Variant = _scene.resolve(node_path)
	if node is CommandError:
		return node
	var expression := Expression.new()
	if expression.parse(expression_text) != OK:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" does not parse: %s" % [expression_text, expression.get_error_text()], EXPRESSION_HINT)
	var value: Variant = expression.execute([], node, false)
	if expression.has_execute_failed():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"%s\" failed: %s" % [expression_text, expression.get_error_text()], EXPRESSION_HINT)
	return {"node": _scene.path_of(node), "value": _codec.encode(value), "type": _type_name(value)}


static func _type_name(value: Variant) -> String:
	if value is Object and is_instance_valid(value):
		return NodeFactory.display_class(value)
	return type_string(typeof(value))
