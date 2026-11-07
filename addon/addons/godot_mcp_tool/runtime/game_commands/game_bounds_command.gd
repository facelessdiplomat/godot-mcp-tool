extends "../../commands/command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.required_text(params, "path", "\"Player\", or \".\" for the whole current scene")
	if path is GodotMcpCommandError:
		return path
	var resolved: Variant = _scene.resolve(path)
	if resolved is GodotMcpCommandError:
		return resolved
	var node := resolved as Node
	var report: Variant = GodotMcpBoundsReport.describe(node, _codec)
	if report is GodotMcpCommandError:
		return report
	var result := {"scene": _scene.scene_path(), "path": _scene.path_of(node), "type": GodotMcpNodeFactory.display_class(node)}
	result.merge(report)
	return result
