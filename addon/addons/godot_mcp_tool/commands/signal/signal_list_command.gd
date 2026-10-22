extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const NodeLocator := preload("../../scene/node_locator.gd")
const Params := preload("../params.gd")
const SceneSnapshot := preload("../../scene/scene_snapshot.gd")
const SceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")
const SignalCatalog := preload("../../scene/signal_catalog.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = Params.text(params, "path")
	var scene_path: Variant = Params.text(params, "scene")
	for value in [node_path, scene_path]:
		if value is CommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is CommandError:
		return resolved
	var snapshot := resolved as SceneSnapshot
	var result: Variant = _scene_connections(snapshot) if (node_path as String).is_empty() else _node_signals(snapshot, node_path)
	snapshot.release()
	return result


func _scene_connections(snapshot: SceneSnapshot) -> Dictionary:
	var connections: Array = []
	for node in _saved_nodes(snapshot.root, snapshot.root):
		for connection in SignalCatalog.saved_connections(node):
			connections.append(SignalCatalog.describe_connection(snapshot.root, node, connection, _context.codec))
	return {"scene": snapshot.scene_path, "connections": connections}


func _node_signals(snapshot: SceneSnapshot, node_path: String) -> Variant:
	var node := NodeLocator.find(snapshot.root, node_path)
	if node == null:
		return CommandError.new(JsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, NodeLocator.not_found_hint(snapshot.root, node_path))
	var signals: Array = []
	for description in node.get_signal_list():
		var connections: Array = SignalCatalog.saved_connections(node, description["name"]).map(
			func(connection: Dictionary) -> Dictionary: return SignalCatalog.describe_connection(snapshot.root, node, connection, _context.codec)
		)
		signals.append({"name": str(description["name"]), "arguments": SignalCatalog.arguments_text(description), "connections": connections})
	return {"scene": snapshot.scene_path, "path": NodeLocator.path_of(snapshot.root, node), "type": NodeFactory.display_class(node), "signals": signals}


static func _saved_nodes(node: Node, scene_root: Node) -> Array[Node]:
	var nodes: Array[Node] = [node]
	for child in SceneTreeDescriber.owned_children(node, scene_root):
		nodes.append_array(_saved_nodes(child, scene_root))
	return nodes
