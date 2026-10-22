extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const IndefiniteArticle := preload("../../util/indefinite_article.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")
const StateMachineReport := preload("../../animation/state_machine_report.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var tree_path: Variant = Params.required_text(params, "tree", "\"AnimationTree\"")
	for value in [scene_path, tree_path]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var result: Variant = _describe(snapshot, tree_path)
	snapshot.release()
	return result


static func _describe(snapshot: SceneSnapshot, tree_path: String) -> Variant:
	var node := NodeLocator.find(snapshot.root, tree_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % tree_path, NodeLocator.not_found_hint(snapshot.root, tree_path))
	if not node is AnimationTree:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "%s is %s, not an AnimationTree" % [tree_path, IndefiniteArticle.before(NodeFactory.display_class(node))])
	return StateMachineReport.describe(node as AnimationTree, snapshot.root, snapshot.scene_path)
