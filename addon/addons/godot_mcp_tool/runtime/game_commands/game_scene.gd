extends RefCounted

const GodotMcpCommandError := preload("../../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../../bridge/json_rpc.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")

const TREE_ROOT_PATH := "/root"

var _root_provider: Callable


func _init(root_provider: Callable) -> void:
	_root_provider = root_provider


func root() -> Node:
	return _root_provider.call()


func resolve(path_text: String) -> Variant:
	var scene_root := root()
	if scene_root == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NO_SCENE, "The game has no current scene", "Wait until the game has loaded a scene, or use an absolute path such as /root/GameState.")
	var node := _find(scene_root, path_text.strip_edges())
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found in the running game" % path_text, _not_found_hint(scene_root, path_text))
	return node


func path_of(node: Node) -> String:
	var scene_root := root()
	if scene_root != null and (node == scene_root or scene_root.is_ancestor_of(node)):
		return GodotMcpNodeLocator.path_of(scene_root, node)
	return str(node.get_path())


func scene_path() -> String:
	var scene_root := root()
	return scene_root.scene_file_path if scene_root != null else ""


static func _find(scene_root: Node, path_text: String) -> Node:
	if path_text != TREE_ROOT_PATH and not path_text.begins_with(TREE_ROOT_PATH + "/"):
		return GodotMcpNodeLocator.find(scene_root, path_text)
	var tree_root := scene_root.get_tree().root
	var path_below_root := path_text.trim_prefix(TREE_ROOT_PATH).trim_prefix("/")
	return tree_root if path_below_root.is_empty() else tree_root.get_node_or_null(NodePath(path_below_root))


static func _not_found_hint(scene_root: Node, path_text: String) -> String:
	var similar := GodotMcpNodeLocator.similar_paths(scene_root, path_text)
	if not similar.is_empty():
		return "Similar: %s." % ", ".join(similar)
	return "Use game_get_tree to see the node paths of the running game; \".\" is the current scene and /root/… reaches autoloads."
