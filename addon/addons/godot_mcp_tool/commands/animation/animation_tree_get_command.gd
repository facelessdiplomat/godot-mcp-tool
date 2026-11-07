extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpIndefiniteArticle := preload("../../util/indefinite_article.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")
const GodotMcpStateMachineReport := preload("../../animation/state_machine_report.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var tree_path: Variant = GodotMcpParams.required_text(params, "tree", "\"AnimationTree\"")
	for value in [scene_path, tree_path]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant = _describe(snapshot, tree_path)
	snapshot.release()
	return result


static func _describe(snapshot: GodotMcpSceneSnapshot, tree_path: String) -> Variant:
	var node := GodotMcpNodeLocator.find(snapshot.root, tree_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % tree_path, GodotMcpNodeLocator.not_found_hint(snapshot.root, tree_path))
	if not node is AnimationTree:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is %s, not an AnimationTree" % [tree_path, GodotMcpIndefiniteArticle.before(GodotMcpNodeFactory.display_class(node))])
	return GodotMcpStateMachineReport.describe(node as AnimationTree, snapshot.root, snapshot.scene_path)
