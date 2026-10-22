extends "../command.gd"

const BoundsReport := preload("../../capture/bounds_report.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const GameRequestCommand := preload("../game/game_request_command.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: EditingContext
var _game_bounds: GameRequestCommand


func _init(context: EditingContext, game_bounds: GameRequestCommand) -> void:
	_context = context
	_game_bounds = game_bounds


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = Params.required_text(params, "path", "\"Player\", or \".\" for the whole scene")
	var scene_path: Variant = Params.text(params, "scene")
	var in_game: Variant = Params.flag(params, "in_game", false)
	for value in [node_path, scene_path, in_game]:
		if value is CommandError:
			return value
	if in_game:
		if not (scene_path as String).is_empty():
			return CommandError.new(JsonRpc.INVALID_PARAMS, "\"scene\" and \"in_game\" cannot be used together", "With in_game the node is measured in the current scene of the running game.")
		return await _game_bounds.execute({"path": node_path})
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var result: Variant = _measure(snapshot, node_path)
	snapshot.release()
	return result


func _measure(snapshot: SceneSnapshot, node_path: String) -> Variant:
	var node := NodeLocator.find(snapshot.root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(snapshot.root, node_path))
	var report: Variant = BoundsReport.describe(node, _context.codec)
	if report is CommandError:
		return report
	var result := {"scene": snapshot.scene_path, "path": NodeLocator.path_of(snapshot.root, node), "type": NodeFactory.display_class(node)}
	result.merge(report)
	return result
