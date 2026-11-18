extends RefCounted

const GodotMcpNodeFactory := preload("node_factory.gd")
const GodotMcpRayProbe := preload("ray_probe.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const DEFAULT_DROP := 1000.0


static func end_of(from: Vector3, to: Variant) -> Vector3:
	return to if to is Vector3 else from + Vector3.DOWN * DEFAULT_DROP


static func describe(hit: Dictionary, from: Vector3, path_of: Callable, codec: GodotMcpVariantCodec) -> Dictionary:
	if hit.is_empty():
		return {"hit": false}
	var node: Node = hit["node"]
	return {
		"hit": true,
		"position": codec.encode(_rounded(hit["position"])),
		"normal": codec.encode(_rounded(hit["normal"])),
		"distance": snappedf(from.distance_to(hit["position"]), 0.001),
		"node": path_of.call(node) if node != null else "",
		"type": GodotMcpNodeFactory.display_class(node) if node != null else "",
		"by": hit["by"],
	}


static func _rounded(vector: Vector3) -> Vector3:
	return Vector3(snappedf(vector.x, 0.001), snappedf(vector.y, 0.001), snappedf(vector.z, 0.001)) + Vector3.ZERO
