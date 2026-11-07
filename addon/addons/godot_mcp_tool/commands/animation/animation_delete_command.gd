extends "../command.gd"

const GodotMcpAnimationReference := preload("../../animation/animation_reference.gd")
const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")

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
	var animation_reference := reference as GodotMcpAnimationReference
	if not player.has_animation(animation_reference.full_name()):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "%s has no animation \"%s\"" % [player.name, animation_reference.full_name()], "List its animations with animation_get.")
	var library := player.get_animation_library(animation_reference.library_name)
	var animation := library.get_animation(animation_reference.animation_name)
	var changes := GodotMcpChangeSet.new()
	if player.autoplay == animation_reference.full_name():
		changes.add_do_call(player, &"set_autoplay", [""])
		changes.add_undo_call(player, &"set_autoplay", [player.autoplay])
	changes.add_do_call(library, &"remove_animation", [animation_reference.animation_name])
	changes.add_undo_call(library, &"add_animation", [animation_reference.animation_name, animation])
	changes.add_undo_reference(animation)
	_context.history.record("MCP: Delete animation %s" % animation_reference.full_name(), scene_root, [changes])
	return {"scene": scene_root.scene_file_path, "player": GodotMcpNodeLocator.path_of(scene_root, player), "name": animation_reference.full_name()}
