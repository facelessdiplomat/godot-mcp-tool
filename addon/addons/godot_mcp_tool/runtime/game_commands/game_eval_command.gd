extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

const EXPRESSION_HINT := "Write one expression, such as position.y or get_tree().get_nodes_in_group(\"enemies\").size(); an assignment is not an expression, so call set(\"name\", value) instead."

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var expression_text: Variant = GodotMcpParams.required_text(params, "expression", "\"position.y\"")
	var node_path: Variant = GodotMcpParams.text(params, "node", ".")
	for value in [expression_text, node_path]:
		if value is GodotMcpCommandError:
			return value
	var node: Variant = _scene.resolve(node_path)
	if node is GodotMcpCommandError:
		return node
	var expression := Expression.new()
	if expression.parse(expression_text) != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" does not parse: %s" % [expression_text, expression.get_error_text()], EXPRESSION_HINT)
	var value: Variant = expression.execute([], node, false)
	if expression.has_execute_failed():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" failed: %s" % [expression_text, expression.get_error_text()], EXPRESSION_HINT)
	return {"node": _scene.path_of(node), "value": _codec.encode(value), "type": _type_name(value)}


static func _type_name(value: Variant) -> String:
	if value is Object and is_instance_valid(value):
		return GodotMcpNodeFactory.display_class(value)
	return type_string(typeof(value))
