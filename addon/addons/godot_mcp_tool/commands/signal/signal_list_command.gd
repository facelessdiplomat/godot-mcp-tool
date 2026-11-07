extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")
const GodotMcpSceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")
const GodotMcpSignalCatalog := preload("../../scene/signal_catalog.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.text(params, "path")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	for value in [node_path, scene_path]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var result: Variant = _scene_connections(snapshot) if (node_path as String).is_empty() else _node_signals(snapshot, node_path)
	snapshot.release()
	return result


func _scene_connections(snapshot: GodotMcpSceneSnapshot) -> Dictionary:
	var connections: Array = []
	for node in _saved_nodes(snapshot.root, snapshot.root):
		for connection in GodotMcpSignalCatalog.saved_connections(node):
			connections.append(GodotMcpSignalCatalog.describe_connection(snapshot.root, node, connection, _context.codec))
	return {"scene": snapshot.scene_path, "connections": connections}


func _node_signals(snapshot: GodotMcpSceneSnapshot, node_path: String) -> Variant:
	var node := GodotMcpNodeLocator.find(snapshot.root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(snapshot.root, node_path))
	var signals: Array = []
	for description in node.get_signal_list():
		var connections: Array = GodotMcpSignalCatalog.saved_connections(node, description["name"]).map(
			func(connection: Dictionary) -> Dictionary: return GodotMcpSignalCatalog.describe_connection(snapshot.root, node, connection, _context.codec)
		)
		signals.append({"name": str(description["name"]), "arguments": GodotMcpSignalCatalog.arguments_text(description), "connections": connections})
	return {"scene": snapshot.scene_path, "path": GodotMcpNodeLocator.path_of(snapshot.root, node), "type": GodotMcpNodeFactory.display_class(node), "signals": signals}


static func _saved_nodes(node: Node, scene_root: Node) -> Array[Node]:
	var nodes: Array[Node] = [node]
	for child in GodotMcpSceneTreeDescriber.owned_children(node, scene_root):
		nodes.append_array(_saved_nodes(child, scene_root))
	return nodes
