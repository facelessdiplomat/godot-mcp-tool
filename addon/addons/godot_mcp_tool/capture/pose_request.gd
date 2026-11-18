extends RefCounted

const GodotMcpAnimationReference := preload("../animation/animation_reference.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpNumberText := preload("../util/number_text.gd")
const GodotMcpSimilarNames := preload("../util/similar_names.gd")

const MAXIMUM_POSES := 6
const DEFAULT_POSE_COUNT := 4
const SECONDS_DECIMALS := 3
const TIME_TOLERANCE := 0.0001
const EXAMPLE := "Example: {\"animation\": {\"player\": \"AnimationPlayer\", \"name\": \"walk\", \"times\": [0, 0.25, 0.5]}}"


static func parse(request: Variant, scene_root: Node) -> Variant:
	if not request is Dictionary or not _is_text(request.get("player")) or not _is_text(request.get("name")):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"animation\" names an AnimationPlayer and one of its animations", EXAMPLE)
	var found: Variant = GodotMcpAnimationReference.find_player(scene_root, request["player"])
	if found is GodotMcpCommandError:
		return found
	var player := found as AnimationPlayer
	var name: String = request["name"]
	if not player.has_animation(name):
		var known := Array(player.get_animation_list()).map(func(animation_name: StringName) -> String: return str(animation_name))
		var similar := GodotMcpSimilarNames.hint(name, known)
		var hint := similar if not similar.is_empty() else "Its animations: %s." % ", ".join(PackedStringArray(known))
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no animation \"%s\"" % [player.name, name], hint)
	var animation := player.get_animation(name)
	var times: Variant = request.get("times")
	if times == null:
		times = default_times(animation.length, animation.loop_mode != Animation.LOOP_NONE)
	var problem := _times_problem(times, animation.length, name)
	if not problem.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, problem, EXAMPLE)
	return {"player": player, "animation": animation, "name": name, "times": (times as Array).map(func(time: Variant) -> float: return float(time))}


static func default_times(length: float, loops: bool) -> Array:
	var steps := DEFAULT_POSE_COUNT if loops else DEFAULT_POSE_COUNT - 1
	var times: Array = []
	for index in DEFAULT_POSE_COUNT:
		times.append(length * index / steps)
	return times


static func label_of(name: String, time: float) -> String:
	return "%s at %s s" % [name, GodotMcpNumberText.of(time, SECONDS_DECIMALS)]


static func _times_problem(times: Variant, length: float, name: String) -> String:
	if not times is Array or (times as Array).is_empty() or (times as Array).size() > MAXIMUM_POSES:
		return "\"times\" lists 1 to %d times in seconds to pose the scene at" % MAXIMUM_POSES
	for time in times:
		if not (time is int or time is float) or float(time) < 0.0:
			return "each time is seconds from the start of the animation, such as 0.25"
		if float(time) > length + TIME_TOLERANCE:
			return "%s s is after the end of %s at %s s" % [GodotMcpNumberText.of(time, SECONDS_DECIMALS), name, GodotMcpNumberText.of(length, SECONDS_DECIMALS)]
	return ""


static func _is_text(value: Variant) -> bool:
	return value is String and not (value as String).is_empty()
