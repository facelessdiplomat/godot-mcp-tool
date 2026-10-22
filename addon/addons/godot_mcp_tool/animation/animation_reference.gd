extends RefCounted

const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const NodeFactory := preload("../scene/node_factory.gd")
const NodeLocator := preload("../scene/node_locator.gd")

const FORBIDDEN_NAME_CHARACTERS := ["/", ":", ",", "["]
const LIBRARY_SEPARATOR := "/"

var library_name := ""
var animation_name := ""


static func find_player(scene_root: Node, player_path: String) -> Variant:
	var node := NodeLocator.find(scene_root, player_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % player_path, NodeLocator.not_found_hint(scene_root, player_path))
	if not node is AnimationPlayer:
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"%s is a %s, not an AnimationPlayer" % [player_path, NodeFactory.display_class(node)],
			"Add an AnimationPlayer with node_add; its tracks animate the nodes under its parent.",
		)
	return node


static func parse(full_name: String) -> Variant:
	var reference := new()
	var name := full_name.strip_edges()
	if name.contains(LIBRARY_SEPARATOR):
		reference.library_name = name.get_slice(LIBRARY_SEPARATOR, 0)
		name = name.substr(reference.library_name.length() + 1)
	reference.animation_name = name
	if name.is_empty() or FORBIDDEN_NAME_CHARACTERS.any(func(character: String) -> bool: return name.contains(character)) or _has_forbidden_character(reference.library_name):
		return CommandError.new(
			JsonRpc.INVALID_PARAMS,
			"\"%s\" is not a valid animation name" % full_name,
			"Animation names cannot be empty or contain / : , [; write \"library/name\" for an animation of another library than the default one.",
		)
	return reference


static func _has_forbidden_character(library_name: String) -> bool:
	return FORBIDDEN_NAME_CHARACTERS.any(func(character: String) -> bool: return library_name.contains(character))


func full_name() -> String:
	return animation_name if library_name.is_empty() else "%s%s%s" % [library_name, LIBRARY_SEPARATOR, animation_name]
