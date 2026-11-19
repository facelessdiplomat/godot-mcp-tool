extends RefCounted

const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpLayerNames := preload("../codec/layer_names.gd")
const GodotMcpNavigationPathReport := preload("navigation_path_report.gd")
const GodotMcpParams := preload("../commands/params.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const DEFAULT_LAYERS := 1
const MOST_PHYSICS_FRAMES_TO_WAIT := 120
const LAYERS_PROPERTY := {"name": "navigation_layers", "type": TYPE_INT, "hint": PROPERTY_HINT_LAYERS_3D_NAVIGATION, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT, "class_name": &""}


static func read_request(params: Dictionary, codec: GodotMcpVariantCodec) -> Variant:
	var from: Variant = GodotMcpParams.point(params, "from")
	var to: Variant = GodotMcpParams.point(params, "to")
	for value in [from, to]:
		if value is GodotMcpCommandError:
			return value
	if from == null or to == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"from\" and \"to\" are required", "Example: {\"from\": [0, 0, 8], \"to\": [0, 0, -8]}")
	var layers := DEFAULT_LAYERS
	if params.get("navigation_layers") != null:
		var decoded := codec.decode(params["navigation_layers"], LAYERS_PROPERTY)
		if not decoded.is_success:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"navigation_layers\": %s" % decoded.error)
		layers = decoded.value
	return {"from": from, "to": to, "layers": layers}


static func wait_for_syncs(tree: SceneTree, map: RID, syncs: int) -> void:
	var seen := NavigationServer3D.map_get_iteration_id(map)
	var counted := 0
	for frame in MOST_PHYSICS_FRAMES_TO_WAIT:
		if counted >= syncs:
			return
		await tree.physics_frame
		var iteration := NavigationServer3D.map_get_iteration_id(map)
		if iteration != seen:
			seen = iteration
			counted += 1


static func query(map: RID, request: Dictionary, codec: GodotMcpVariantCodec) -> Dictionary:
	var from: Vector3 = request["from"]
	var to: Vector3 = request["to"]
	var path := NavigationServer3D.map_get_path(map, from, to, true, int(request["layers"]))
	var report := GodotMcpNavigationPathReport.describe(path, from, to, NavigationServer3D.map_get_closest_point(map, from), NavigationServer3D.map_get_closest_point(map, to), codec)
	report["from"] = codec.encode(from)
	report["to"] = codec.encode(to)
	report["navigation_layers"] = GodotMcpLayerNames.layers_in_mask(PROPERTY_HINT_LAYERS_3D_NAVIGATION, int(request["layers"]))
	return report
