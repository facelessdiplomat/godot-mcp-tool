extends "../../commands/command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeSelection := preload("../../commands/node_selection.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var selection: Variant = GodotMcpNodeSelection.read(params, "\"Player\", or \".\" for the whole current scene")
	if selection is GodotMcpCommandError:
		return selection
	if selection is String:
		return _measure(selection)
	var nodes: Array = []
	for node_path: String in selection:
		nodes.append(GodotMcpNodeSelection.entry_of(node_path, _measure(node_path)))
	return {"scene": _scene.scene_path(), "nodes": nodes}


func _measure(path: String) -> Variant:
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
