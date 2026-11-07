extends "../command.gd"

const GodotMcpBoundsReport := preload("../../capture/bounds_report.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGameRequestCommand := preload("../game/game_request_command.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: GodotMcpEditingContext
var _game_bounds: GodotMcpGameRequestCommand


func _init(context: GodotMcpEditingContext, game_bounds: GodotMcpGameRequestCommand) -> void:
	_context = context
	_game_bounds = game_bounds


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Player\", or \".\" for the whole scene")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var in_game: Variant = GodotMcpParams.flag(params, "in_game", false)
	for value in [node_path, scene_path, in_game]:
		if value is GodotMcpCommandError:
			return value
	if in_game:
		if not (scene_path as String).is_empty():
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"scene\" and \"in_game\" cannot be used together", "With in_game the node is measured in the current scene of the running game.")
		return await _game_bounds.execute({"path": node_path})
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant = _measure(snapshot, node_path)
	snapshot.release()
	return result


func _measure(snapshot: GodotMcpSceneSnapshot, node_path: String) -> Variant:
	var node := GodotMcpNodeLocator.find(snapshot.root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(snapshot.root, node_path))
	var report: Variant = GodotMcpBoundsReport.describe(node, _context.codec)
	if report is GodotMcpCommandError:
		return report
	var result := {"scene": snapshot.scene_path, "path": GodotMcpNodeLocator.path_of(snapshot.root, node), "type": GodotMcpNodeFactory.display_class(node)}
	result.merge(report)
	return result
