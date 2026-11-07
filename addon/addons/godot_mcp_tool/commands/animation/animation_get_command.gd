extends "../command.gd"

const GodotMcpAnimationReference := preload("../../animation/animation_reference.gd")
const GodotMcpAnimationReport := preload("../../animation/animation_report.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var player_path: Variant = GodotMcpParams.required_text(params, "player", "\"AnimationPlayer\"")
	var name: Variant = GodotMcpParams.text(params, "name")
	for value in [scene_path, player_path, name]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant = _describe(snapshot, player_path, name)
	snapshot.release()
	return result


func _describe(snapshot: GodotMcpSceneSnapshot, player_path: String, name: String) -> Variant:
	var found: Variant = GodotMcpAnimationReference.find_player(snapshot.root, player_path)
	if found is GodotMcpCommandError:
		return found
	var player := found as AnimationPlayer
	var result := {
		"scene": snapshot.scene_path,
		"player": GodotMcpNodeLocator.path_of(snapshot.root, player),
		"root_node": str(player.root_node),
		"autoplay": player.autoplay,
	}
	if name.is_empty():
		result["animations"] = GodotMcpAnimationReport.list(player)
		return result
	if not player.has_animation(name):
		var names := ", ".join(PackedStringArray(Array(player.get_animation_list()).map(func(animation_name: StringName) -> String: return str(animation_name))))
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no animation \"%s\"" % [player.name, name], "Animations of %s: %s." % [player.name, names if not names.is_empty() else "none yet; create one with animation_set"])
	result["animation"] = GodotMcpAnimationReport.detail(player.get_animation(name), name, _context.codec)
	return result
