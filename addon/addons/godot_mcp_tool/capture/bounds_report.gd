extends RefCounted

const Bounds := preload("bounds.gd")
const CommandError := preload("../commands/command_error.gd")
const JsonRpc := preload("../bridge/json_rpc.gd")
const NodeFactory := preload("../scene/node_factory.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const DECIMAL_SCALE := 1000.0


static func describe(node: Node, codec: VariantCodec) -> Variant:
	var not_3d := _not_3d_error(node)
	if not_3d != null:
		return not_3d
	var measured := Bounds.measure(node)
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
	return Bounds.measure(node)["aabb"]


static func _not_3d_error(node: Node) -> CommandError:
	if node is Node3D:
		return null
	return CommandError.new(
		JsonRpc.INVALID_PARAMS,
		"\"%s\" is a %s, not a 3D node" % [node.name, NodeFactory.display_class(node)],
		"Bounds are measured for Node3D nodes, such as MeshInstance3D, CSGBox3D or CharacterBody3D, together with their children.",
	)


static func _rounded(vector: Vector3) -> Vector3:
	return _without_negative_zeros((vector * DECIMAL_SCALE).round() / DECIMAL_SCALE)


static func _without_negative_zeros(vector: Vector3) -> Vector3:
	return vector + Vector3.ZERO
