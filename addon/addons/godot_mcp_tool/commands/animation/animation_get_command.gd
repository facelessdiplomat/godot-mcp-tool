extends "../command.gd"

const AnimationReference := preload("../../animation/animation_reference.gd")
const AnimationReport := preload("../../animation/animation_report.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var player_path: Variant = Params.required_text(params, "player", "\"AnimationPlayer\"")
	var name: Variant = Params.text(params, "name")
	for value in [scene_path, player_path, name]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var result: Variant = _describe(snapshot, player_path, name)
	snapshot.release()
	return result


func _describe(snapshot: SceneSnapshot, player_path: String, name: String) -> Variant:
	var found: Variant = AnimationReference.find_player(snapshot.root, player_path)
	if found is CommandError:
		return found
	var player := found as AnimationPlayer
	var result := {
		"scene": snapshot.scene_path,
		"player": NodeLocator.path_of(snapshot.root, player),
		"root_node": str(player.root_node),
		"autoplay": player.autoplay,
	}
	if name.is_empty():
		result["animations"] = AnimationReport.list(player)
		return result
	if not player.has_animation(name):
		var names := ", ".join(PackedStringArray(Array(player.get_animation_list()).map(func(animation_name: StringName) -> String: return str(animation_name))))
		return CommandError.new(JsonRpc.NOT_FOUND, "%s has no animation \"%s\"" % [player.name, name], "Animations of %s: %s." % [player.name, names if not names.is_empty() else "none yet; create one with animation_set"])
	result["animation"] = AnimationReport.detail(player.get_animation(name), name, _context.codec)
	return result
