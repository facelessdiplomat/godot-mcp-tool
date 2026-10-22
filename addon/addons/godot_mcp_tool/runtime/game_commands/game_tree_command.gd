extends "../../commands/command.gd"

const GameScene := preload("game_scene.gd")
const Params := preload("../../commands/params.gd")
const SceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_DEPTH := 8
const DEFAULT_MAX_NODES := 300

var _scene: GameScene


func _init(scene: GameScene) -> void:
	_scene = scene


func execute(params: Dictionary) -> Variant:
	var path: Variant = Params.text(params, "path", ".")
	var max_depth: Variant = Params.whole_number(params, "max_depth", DEFAULT_MAX_DEPTH)
	var max_nodes: Variant = Params.whole_number(params, "max_nodes", DEFAULT_MAX_NODES)
	for value in [path, max_depth, max_nodes]:
		if value is CommandError:
			return value
	var node: Variant = _scene.resolve(path)
	if node is CommandError:
		return node
	var describer := SceneTreeDescriber.new(true)
	var description := describer.describe(node, maxi(max_depth, 0), maxi(max_nodes, 1))
	return {"scene": _scene.scene_path(), "root": description, "node_count": describer.node_count, "truncated": describer.truncated}
