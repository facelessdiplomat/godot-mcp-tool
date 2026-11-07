extends "../command.gd"

const GodotMcpAnimationReference := preload("../../animation/animation_reference.gd")
const GodotMcpAnimationTrackPlanner := preload("../../animation/animation_track_planner.gd")
const GodotMcpAnimationVocabulary := preload("../../animation/animation_vocabulary.gd")
const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")

const RESET_NAME := "RESET"
const DEFAULT_LIBRARY := ""
const TRACKS_EXAMPLE := "Example: {\"player\": \"AnimationPlayer\", \"name\": \"open\", \"length\": 1, \"tracks\": [{\"path\": \"Door:position\", \"keys\": [{\"time\": 0, \"value\": [0, 0, 0]}, {\"time\": 1, \"value\": [0, 3, 0]}]}]}"

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var player_path: Variant = GodotMcpParams.required_text(params, "player", "\"AnimationPlayer\"")
	var full_name: Variant = GodotMcpParams.required_text(params, "name", "\"open\"")
	for value in [scene_path, player_path, full_name]:
		if value is GodotMcpCommandError:
			return value
	var tracks: Variant = params.get("tracks", [])
	if not tracks is Array or (tracks as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"tracks\" needs at least one track", TRACKS_EXAMPLE)
	var length: Variant = params.get("length")
	if length != null and (not (length is int or length is float) or float(length) <= 0.0):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"length\" is the length of the animation in seconds, above 0", TRACKS_EXAMPLE)
	var loop_mode: Variant = GodotMcpAnimationVocabulary.value_of(GodotMcpAnimationVocabulary.LOOP_MODES, params.get("loop", "none"))
	if loop_mode == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown loop \"%s\"" % params.get("loop"), "Use one of: %s." % GodotMcpAnimationVocabulary.listed(GodotMcpAnimationVocabulary.LOOP_MODES))
	var reference: Variant = GodotMcpAnimationReference.parse(full_name)
	if reference is GodotMcpCommandError:
		return reference
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var found: Variant = GodotMcpAnimationReference.find_player(scene_root, player_path)
	if found is GodotMcpCommandError:
		return found
	var player := found as AnimationPlayer
	var root := player.get_node_or_null(player.root_node)
	if root == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The root_node of %s points to no node" % player.name, "Set root_node to the node whose children the animation moves, such as \"..\".")
	var planner := GodotMcpAnimationTrackPlanner.new(_context.codec, root)
	var planned := planner.plan(tracks, float(length) if length != null else null)
	var result := {
		"scene": scene_root.scene_file_path,
		"player": GodotMcpNodeLocator.path_of(scene_root, player),
		"name": (reference as GodotMcpAnimationReference).full_name(),
		"created": not player.has_animation((reference as GodotMcpAnimationReference).full_name()),
		"length": planned["length"],
		"loop": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.LOOP_MODES, loop_mode),
		"tracks": (planned["tracks"] as Array).map(planner.describe),
		"rejected": planned["rejected"],
		"reset_tracks": [],
	}
	if (planned["tracks"] as Array).is_empty():
		result["created"] = false
		return result
	var stored := [[(reference as GodotMcpAnimationReference).library_name, (reference as GodotMcpAnimationReference).animation_name, planner.build(planned["tracks"], planned["length"], loop_mode)]]
	if result["name"] != RESET_NAME:
		var previous_reset := player.get_animation(RESET_NAME) if player.has_animation(RESET_NAME) else null
		var reset_tracks := (planned["tracks"] as Array).filter(func(track: Dictionary) -> bool: return previous_reset == null or previous_reset.find_track(NodePath(track["path"]), Animation.TYPE_VALUE) == -1)
		if not reset_tracks.is_empty():
			result["reset_tracks"] = reset_tracks.map(func(track: Dictionary) -> String: return track["path"])
			stored.append([DEFAULT_LIBRARY, RESET_NAME, planner.build_reset(previous_reset, reset_tracks)])
	_context.history.record("MCP: Set animation %s" % result["name"], scene_root, [_store(player, stored)])
	return result


static func _store(player: AnimationPlayer, stored: Array) -> GodotMcpChangeSet:
	var changes := GodotMcpChangeSet.new()
	var new_libraries := {}
	for entry in stored:
		var library_name: String = entry[0]
		var animation_name: String = entry[1]
		var animation: Animation = entry[2]
		if not player.has_animation_library(library_name):
			if not new_libraries.has(library_name):
				var new_library := AnimationLibrary.new()
				new_libraries[library_name] = new_library
				changes.add_do_call(player, &"add_animation_library", [library_name, new_library])
				changes.add_do_reference(new_library)
				changes.add_undo_call(player, &"remove_animation_library", [library_name])
			(new_libraries[library_name] as AnimationLibrary).add_animation(animation_name, animation)
			continue
		var library := player.get_animation_library(library_name)
		changes.add_do_call(library, &"add_animation", [animation_name, animation])
		changes.add_do_reference(animation)
		if library.has_animation(animation_name):
			var previous := library.get_animation(animation_name)
			changes.add_undo_call(library, &"add_animation", [animation_name, previous])
			changes.add_undo_reference(previous)
		else:
			changes.add_undo_call(library, &"remove_animation", [animation_name])
	return changes
