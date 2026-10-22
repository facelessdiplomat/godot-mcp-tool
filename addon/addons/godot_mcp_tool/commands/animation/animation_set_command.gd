extends "../command.gd"

const AnimationReference := preload("../../animation/animation_reference.gd")
const AnimationTrackPlanner := preload("../../animation/animation_track_planner.gd")
const AnimationVocabulary := preload("../../animation/animation_vocabulary.gd")
const ChangeSet := preload("../../scene/change_set.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")

const TRACKS_EXAMPLE := "Example: {\"player\": \"AnimationPlayer\", \"name\": \"open\", \"length\": 1, \"tracks\": [{\"path\": \"Door:position\", \"keys\": [{\"time\": 0, \"value\": [0, 0, 0]}, {\"time\": 1, \"value\": [0, 3, 0]}]}]}"

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.text(params, "scene")
	var player_path: Variant = Params.required_text(params, "player", "\"AnimationPlayer\"")
	var full_name: Variant = Params.required_text(params, "name", "\"open\"")
	for value in [scene_path, player_path, full_name]:
		if value is CommandError:
			return value
	var tracks: Variant = params.get("tracks", [])
	if not tracks is Array or (tracks as Array).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"tracks\" needs at least one track", TRACKS_EXAMPLE)
	var length: Variant = params.get("length")
	if length != null and (not (length is int or length is float) or float(length) <= 0.0):
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"length\" is the length of the animation in seconds, above 0", TRACKS_EXAMPLE)
	var loop_mode: Variant = AnimationVocabulary.value_of(AnimationVocabulary.LOOP_MODES, params.get("loop", "none"))
	if loop_mode == null:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Unknown loop \"%s\"" % params.get("loop"), "Use one of: %s." % AnimationVocabulary.listed(AnimationVocabulary.LOOP_MODES))
	var reference: Variant = AnimationReference.parse(full_name)
	if reference is CommandError:
		return reference
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is CommandError:
		return resolved
	var scene_root := resolved as Node
	var found: Variant = AnimationReference.find_player(scene_root, player_path)
	if found is CommandError:
		return found
	var player := found as AnimationPlayer
	var root := player.get_node_or_null(player.root_node)
	if root == null:
		return CommandError.new(JsonRpc.INVALID_PARAMS, "The root_node of %s points to no node" % player.name, "Set root_node to the node whose children the animation moves, such as \"..\".")
	var planner := AnimationTrackPlanner.new(_context.codec, root)
	var planned := planner.plan(tracks, float(length) if length != null else null)
	var result := {
		"scene": scene_root.scene_file_path,
		"player": NodeLocator.path_of(scene_root, player),
		"name": (reference as AnimationReference).full_name(),
		"created": not player.has_animation((reference as AnimationReference).full_name()),
		"length": planned["length"],
		"loop": AnimationVocabulary.name_of(AnimationVocabulary.LOOP_MODES, loop_mode),
		"tracks": (planned["tracks"] as Array).map(planner.describe),
		"rejected": planned["rejected"],
	}
	if (planned["tracks"] as Array).is_empty():
		result["created"] = false
		return result
	var animation := planner.build(planned["tracks"], planned["length"], loop_mode)
	_context.history.record("MCP: Set animation %s" % result["name"], scene_root, [_store(player, reference, animation)])
	return result


static func _store(player: AnimationPlayer, reference: AnimationReference, animation: Animation) -> ChangeSet:
	var changes := ChangeSet.new()
	if not player.has_animation_library(reference.library_name):
		var library := AnimationLibrary.new()
		library.add_animation(reference.animation_name, animation)
		changes.add_do_call(player, &"add_animation_library", [reference.library_name, library])
		changes.add_do_reference(library)
		changes.add_undo_call(player, &"remove_animation_library", [reference.library_name])
		return changes
	var library := player.get_animation_library(reference.library_name)
	changes.add_do_call(library, &"add_animation", [reference.animation_name, animation])
	changes.add_do_reference(animation)
	if library.has_animation(reference.animation_name):
		var previous := library.get_animation(reference.animation_name)
		changes.add_undo_call(library, &"add_animation", [reference.animation_name, previous])
		changes.add_undo_reference(previous)
	else:
		changes.add_undo_call(library, &"remove_animation", [reference.animation_name])
	return changes
