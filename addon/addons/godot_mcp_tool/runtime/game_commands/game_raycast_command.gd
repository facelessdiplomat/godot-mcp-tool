extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpRayProbe := preload("../../scene/ray_probe.gd")
const GodotMcpRayReport := preload("../../scene/ray_report.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

var _scene: GodotMcpGameScene
var _codec: GodotMcpVariantCodec


func _init(scene: GodotMcpGameScene, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var from: Variant = GodotMcpParams.point(params, "from")
	var to: Variant = GodotMcpParams.point(params, "to")
	var exclude: Variant = GodotMcpParams.text_list(params, "exclude")
	for value in [from, to, exclude]:
		if value is GodotMcpCommandError:
			return value
	if from == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"from\" is required", "Example: {\"from\": [0, 10, 0]}")
	var scene_root := _scene.root()
	if scene_root == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NO_SCENE, "The game has no current scene")
	var excluded: Array[Node] = []
	for path in exclude:
		var node: Variant = _scene.resolve(path)
		if node is GodotMcpCommandError:
			return node
		excluded.append(node)
	await scene_root.get_tree().physics_frame
	var end := GodotMcpRayReport.end_of(from, to)
	var hit := GodotMcpRayProbe.cast(scene_root, from, end, excluded)
	var result := GodotMcpRayReport.describe(hit, from, _scene.path_of, _codec)
	result["scene"] = _scene.scene_path()
	result["from"] = _codec.encode(from)
	result["to"] = _codec.encode(end)
	return result
