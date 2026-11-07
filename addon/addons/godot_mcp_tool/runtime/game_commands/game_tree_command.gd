extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpSceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_DEPTH := 8
const DEFAULT_MAX_NODES := 300

var _scene: GodotMcpGameScene


func _init(scene: GodotMcpGameScene) -> void:
	_scene = scene


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.text(params, "path", ".")
	var max_depth: Variant = GodotMcpParams.whole_number(params, "max_depth", DEFAULT_MAX_DEPTH)
	var max_nodes: Variant = GodotMcpParams.whole_number(params, "max_nodes", DEFAULT_MAX_NODES)
	for value in [path, max_depth, max_nodes]:
		if value is GodotMcpCommandError:
			return value
	var node: Variant = _scene.resolve(path)
	if node is GodotMcpCommandError:
		return node
	var describer := GodotMcpSceneTreeDescriber.new(true)
	var description := describer.describe(node, maxi(max_depth, 0), maxi(max_nodes, 1))
	return {"scene": _scene.scene_path(), "root": description, "node_count": describer.node_count, "truncated": describer.truncated}
