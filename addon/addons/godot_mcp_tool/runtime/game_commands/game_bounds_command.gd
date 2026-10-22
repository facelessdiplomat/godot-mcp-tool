extends "../../commands/command.gd"

const BoundsReport := preload("../../capture/bounds_report.gd")
const GameScene := preload("game_scene.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../../commands/params.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

var _scene: GameScene
var _codec: VariantCodec


func _init(scene: GameScene, codec: VariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var path: Variant = Params.required_text(params, "path", "\"Player\", or \".\" for the whole current scene")
	if path is CommandError:
		return path
	var resolved: Variant = _scene.resolve(path)
	if resolved is CommandError:
		return resolved
	var node := resolved as Node
	var report: Variant = BoundsReport.describe(node, _codec)
	if report is CommandError:
		return report
	var result := {"scene": _scene.scene_path(), "path": _scene.path_of(node), "type": NodeFactory.display_class(node)}
	result.merge(report)
	return result
