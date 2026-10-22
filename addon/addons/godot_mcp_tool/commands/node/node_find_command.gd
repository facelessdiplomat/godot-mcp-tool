extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const NodeMatcher := preload("../../scene/node_matcher.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")
const SceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_RESULTS := 50

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var name_pattern: Variant = Params.text(params, "name")
	var type_name: Variant = Params.text(params, "type")
	var group: Variant = Params.text(params, "group")
	var script_path: Variant = Params.text(params, "script")
	var scene_path: Variant = Params.text(params, "scene")
	var max_results: Variant = Params.whole_number(params, "max_results", DEFAULT_MAX_RESULTS)
	for value in [name_pattern, type_name, group, script_path, scene_path, max_results]:
		if value is CommandError:
			return value
	if [name_pattern, type_name, group, script_path].all(func(criterion: String) -> bool: return criterion.is_empty()):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Give at least one of name, type, group or script", "Example: {\"type\": \"Light3D\"} or {\"name\": \"Enemy*\"}")
	if not (type_name as String).is_empty() and not NodeFactory.is_known_class(type_name):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Unknown type %s" % type_name, NodeFactory.unknown_type_hint(type_name))
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var found: Array[Node] = []
	_collect_matches(snapshot.root, snapshot.root, NodeMatcher.new(name_pattern, type_name, group, script_path), found)
	var limit := maxi(max_results, 1)
	var matches: Array = []
	for node in found.slice(0, limit):
		var entry := {"path": NodeLocator.path_of(snapshot.root, node)}
		entry.merge(SceneTreeDescriber.traits_of(node, snapshot.root))
		matches.append(entry)
	var result := {"scene": snapshot.scene_path, "matches": matches, "total": found.size(), "truncated": found.size() > limit}
	snapshot.release()
	return result


static func _collect_matches(node: Node, scene_root: Node, matcher: NodeMatcher, found: Array[Node]) -> void:
	if matcher.matches(node):
		found.append(node)
	for child in SceneTreeDescriber.owned_children(node, scene_root):
		_collect_matches(child, scene_root, matcher, found)
