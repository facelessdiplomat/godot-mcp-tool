extends "../command.gd"

const AnimationReference := preload("../../animation/animation_reference.gd")
const ChangeSet := preload("../../scene/change_set.gd")
const EditingContext := preload("../../scene/editing_context.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")

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
	var animation_reference := reference as AnimationReference
	if not player.has_animation(animation_reference.full_name()):
		return CommandError.new(JsonRpc.NOT_FOUND, "%s has no animation \"%s\"" % [player.name, animation_reference.full_name()], "List its animations with animation_get.")
	var library := player.get_animation_library(animation_reference.library_name)
	var animation := library.get_animation(animation_reference.animation_name)
	var changes := ChangeSet.new()
	changes.add_do_call(library, &"remove_animation", [animation_reference.animation_name])
	changes.add_undo_call(library, &"add_animation", [animation_reference.animation_name, animation])
	changes.add_undo_reference(animation)
	_context.history.record("MCP: Delete animation %s" % animation_reference.full_name(), scene_root, [changes])
	return {"scene": scene_root.scene_file_path, "player": NodeLocator.path_of(scene_root, player), "name": animation_reference.full_name()}
