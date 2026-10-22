extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")
const SceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_DEPTH := 8
const DEFAULT_MAX_NODES := 300

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var max_depth: Variant = Params.whole_number(params, "max_depth", DEFAULT_MAX_DEPTH)
	var max_nodes: Variant = Params.whole_number(params, "max_nodes", DEFAULT_MAX_NODES)
	for value in [scene_path, max_depth, max_nodes]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var describer := SceneTreeDescriber.new()
	var result := {
		"scene": snapshot.scene_path,
		"root": describer.describe(snapshot.root, maxi(max_depth, 0), maxi(max_nodes, 1)),
		"node_count": describer.node_count,
		"truncated": describer.truncated,
	}
	if not snapshot.is_temporary:
		result["unsaved"] = _context.scenes.access.is_scene_unsaved(snapshot.root)
	snapshot.release()
	return result
