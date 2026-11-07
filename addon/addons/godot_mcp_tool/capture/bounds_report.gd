extends RefCounted

const GodotMcpBounds := preload("bounds.gd")
const GodotMcpCommandError := preload("../commands/command_error.gd")
const GodotMcpJsonRpc := preload("../bridge/json_rpc.gd")
const GodotMcpNodeFactory := preload("../scene/node_factory.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const DECIMAL_SCALE := 1000.0


static func describe(node: Node, codec: GodotMcpVariantCodec) -> Variant:
	var not_3d := _not_3d_error(node)
	if not_3d != null:
		return not_3d
	var measured := GodotMcpBounds.measure(node)
	var aabb := measured["aabb"] as AABB
	return {
		"position": codec.encode(_rounded(aabb.position)),
		"size": codec.encode(_rounded(aabb.size)),
		"center": codec.encode(_rounded(aabb.get_center())),
		"end": codec.encode(_rounded(aabb.end)),
		"visual_count": measured["visual_count"],
		"collision_count": measured["collision_count"],
	}


static func framing_bounds(node: Node, is_whole_scene: bool) -> Variant:
	var not_3d := _not_3d_error(node)
	if not_3d != null and not is_whole_scene:
		return not_3d
	return GodotMcpBounds.measure(node)["aabb"]


static func _not_3d_error(node: Node) -> GodotMcpCommandError:
	if node is Node3D:
		return null
	return GodotMcpCommandError.new(
		GodotMcpJsonRpc.INVALID_PARAMS,
		"\"%s\" is a %s, not a 3D node" % [node.name, GodotMcpNodeFactory.display_class(node)],
		"Bounds are measured for Node3D nodes, such as MeshInstance3D, CSGBox3D or CharacterBody3D, together with their children.",
	)


static func _rounded(vector: Vector3) -> Vector3:
	return _without_negative_zeros((vector * DECIMAL_SCALE).round() / DECIMAL_SCALE)


static func _without_negative_zeros(vector: Vector3) -> Vector3:
	return vector + Vector3.ZERO
