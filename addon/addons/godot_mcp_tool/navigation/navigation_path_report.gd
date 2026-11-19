extends RefCounted

const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const REACHED_TOLERANCE := 0.3
const POINTS_AT_EACH_END := 5
const SHOWN_PRECISION := 0.001


static func describe(path: PackedVector3Array, from: Vector3, to: Vector3, start_on_mesh: Vector3, target_on_mesh: Vector3, codec: GodotMcpVariantCodec) -> Dictionary:
	var report := {
		"reached": false,
		"length": 0.0,
		"point_count": path.size(),
		"points": [],
		"start_off_mesh": from.distance_to(start_on_mesh),
		"target_off_mesh": to.distance_to(target_on_mesh),
	}
	if path.is_empty():
		return report
	var end := path[path.size() - 1]
	report["length"] = _length_of(path)
	report["end"] = codec.encode(_rounded(end))
	report["short_by"] = end.distance_to(target_on_mesh)
	report["reached"] = end.distance_to(target_on_mesh) <= REACHED_TOLERANCE
	var shown := path if path.size() <= POINTS_AT_EACH_END * 2 else path.slice(0, POINTS_AT_EACH_END) + path.slice(path.size() - POINTS_AT_EACH_END)
	report["points"] = Array(shown).map(func(point: Vector3) -> Variant: return codec.encode(_rounded(point)))
	if path.size() > shown.size():
		report["points_left_out"] = path.size() - shown.size()
	return report


static func _length_of(path: PackedVector3Array) -> float:
	var length := 0.0
	for index in range(1, path.size()):
		length += path[index - 1].distance_to(path[index])
	return length


static func _rounded(point: Vector3) -> Vector3:
	return Vector3(snappedf(point.x, SHOWN_PRECISION) + 0.0, snappedf(point.y, SHOWN_PRECISION) + 0.0, snappedf(point.z, SHOWN_PRECISION) + 0.0)
