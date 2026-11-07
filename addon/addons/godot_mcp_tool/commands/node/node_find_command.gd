extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpNodeMatcher := preload("../../scene/node_matcher.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")
const GodotMcpSceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_RESULTS := 50

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var name_pattern: Variant = GodotMcpParams.text(params, "name")
	var type_name: Variant = GodotMcpParams.text(params, "type")
	var group: Variant = GodotMcpParams.text(params, "group")
	var script_path: Variant = GodotMcpParams.text(params, "script")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var max_results: Variant = GodotMcpParams.whole_number(params, "max_results", DEFAULT_MAX_RESULTS)
	for value in [name_pattern, type_name, group, script_path, scene_path, max_results]:
		if value is GodotMcpCommandError:
			return value
	if [name_pattern, type_name, group, script_path].all(func(criterion: String) -> bool: return criterion.is_empty()):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Give at least one of name, type, group or script", "Example: {\"type\": \"Light3D\"} or {\"name\": \"Enemy*\"}")
	if not (type_name as String).is_empty() and not GodotMcpNodeFactory.is_known_class(type_name):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown type %s" % type_name, GodotMcpNodeFactory.unknown_type_hint(type_name))
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var found: Array[Node] = []
	_collect_matches(snapshot.root, snapshot.root, GodotMcpNodeMatcher.new(name_pattern, type_name, group, script_path), found)
	var limit := maxi(max_results, 1)
	var matches: Array = []
	for node in found.slice(0, limit):
		var entry := {"path": GodotMcpNodeLocator.path_of(snapshot.root, node)}
		entry.merge(GodotMcpSceneTreeDescriber.traits_of(node, snapshot.root))
		matches.append(entry)
	var result := {"scene": snapshot.scene_path, "matches": matches, "total": found.size(), "truncated": found.size() > limit}
	snapshot.release()
	return result


static func _collect_matches(node: Node, scene_root: Node, matcher: GodotMcpNodeMatcher, found: Array[Node]) -> void:
	if matcher.matches(node):
		found.append(node)
	for child in GodotMcpSceneTreeDescriber.owned_children(node, scene_root):
		_collect_matches(child, scene_root, matcher, found)
