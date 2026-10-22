extends RefCounted

const Bounds := preload("../capture/bounds.gd")
const NodeFactory := preload("../scene/node_factory.gd")
const SpatialTransforms := preload("../scene/spatial_transforms.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const DECIMAL_SCALE := 1000.0


static func describe(scene_path: String, codec: VariantCodec) -> Variant:
	var scene := ResourceLoader.load(scene_path, "", ResourceLoader.CACHE_MODE_IGNORE) as PackedScene
	if scene == null:
		return null
	var root := scene.instantiate()
	if root == null:
		return null
	var bounds := Bounds.measure(root)["aabb"] as AABB
	var report := {
		"size": codec.encode(_rounded_vector(bounds.size)),
		"position": codec.encode(_rounded_vector(bounds.position)),
		"nodes": [],
		"collision_shapes": [],
	}
	_describe_subtree(root, root, report, codec)
	root.free()
	return report


static func _describe_subtree(node: Node, root: Node, report: Dictionary, codec: VariantCodec) -> void:
	var path := str(root.get_path_to(node))
	var described := {"path": path, "type": NodeFactory.display_class(node)}
	if node is MeshInstance3D:
		described["size"] = codec.encode(_rounded_vector((Bounds.measure(node)["aabb"] as AABB).size))
	(report["nodes"] as Array).append(described)
	if node is CollisionShape3D and (node as CollisionShape3D).shape != null:
		var shape := (node as CollisionShape3D).shape
		(report["collision_shapes"] as Array).append({
			"path": path,
			"shape": shape.get_class(),
			"dimensions": _dimensions_of(shape, codec),
			"position": codec.encode(_rounded_vector(SpatialTransforms.global_of(node).origin)),
		})
	for child in node.get_children():
		_describe_subtree(child, root, report, codec)


static func _dimensions_of(shape: Shape3D, codec: VariantCodec) -> Array:
	if shape is BoxShape3D:
		return [_dimension("size", codec.encode(_rounded_vector((shape as BoxShape3D).size)))]
	if shape is SphereShape3D:
		return [_dimension("radius", _rounded((shape as SphereShape3D).radius))]
	if shape is CapsuleShape3D:
		return [_dimension("radius", _rounded((shape as CapsuleShape3D).radius)), _dimension("height", _rounded((shape as CapsuleShape3D).height))]
	if shape is CylinderShape3D:
		return [_dimension("radius", _rounded((shape as CylinderShape3D).radius)), _dimension("height", _rounded((shape as CylinderShape3D).height))]
	return []


static func _dimension(name: String, value: Variant) -> Dictionary:
	return {"name": name, "value": value}


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE


static func _rounded_vector(vector: Vector3) -> Vector3:
	return (vector * DECIMAL_SCALE).round() / DECIMAL_SCALE + Vector3.ZERO
