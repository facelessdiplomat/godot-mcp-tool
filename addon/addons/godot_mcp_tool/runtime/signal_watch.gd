extends RefCounted

const GodotMcpGameTime := preload("game_time.gd")
const GodotMcpSimilarNames := preload("../util/similar_names.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

var node_path := ""
var signal_name := ""
var emissions: Array = []
var step := 0

var _node: Node
var _time: GodotMcpGameTime
var _codec: GodotMcpVariantCodec
var _first_frame := 0


func _init(node: Node, path_text: String, watched_signal: String, time: GodotMcpGameTime, codec: GodotMcpVariantCodec) -> void:
	_node = node
	node_path = path_text
	signal_name = watched_signal
	_time = time
	_codec = codec


static func missing_signal_hint(node: Node, wanted_signal: String) -> String:
	var names := node.get_signal_list().map(func(description: Dictionary) -> String: return str(description["name"]))
	var similar := GodotMcpSimilarNames.hint(wanted_signal, names)
	return similar if not similar.is_empty() else "signal_list with the path of the node lists its signals, also in the running game's scene file."


func start() -> void:
	_first_frame = _time.frames
	_node.connect(signal_name, _record)


func stop() -> void:
	if is_instance_valid(_node) and _node.is_connected(signal_name, _record):
		_node.disconnect(signal_name, _record)


func describe() -> Dictionary:
	return {"node": node_path, "signal": signal_name, "emissions": emissions}


func _record(...arguments: Array) -> void:
	emissions.append({"step": step, "physics_frames": _time.frames - _first_frame, "arguments": _codec.encode(arguments)})
