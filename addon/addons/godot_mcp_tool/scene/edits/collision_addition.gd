extends "scene_edit.gd"

const GodotMcpBounds := preload("../../capture/bounds.gd")
const GodotMcpNumberText := preload("../../util/number_text.gd")
const GodotMcpSpatialTransforms := preload("../spatial_transforms.gd")

const SHAPES := ["trimesh", "convex", "simplified_convex", "multiple_convex", "box", "capsule", "cylinder", "sphere"]
const PLACEMENTS := ["static_body", "sibling"]
const AXES := {"longest": -1, "x": Vector3.AXIS_X, "y": Vector3.AXIS_Y, "z": Vector3.AXIS_Z}
const MINIMUM_EXTENT := 0.001
const MAXIMUM_CONVEX_HULLS := 32
const MAXIMUM_CONCAVITY := 0.001

var _scene_root: Node
var _instance: MeshInstance3D
var _created: Array[CollisionShape3D] = []


func prepare(scene_root: Node, params: Dictionary) -> GodotMcpCommandError:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Rock\"")
	var shape_name: Variant = GodotMcpParams.required_text(params, "shape", "\"convex\"")
	var placement: Variant = GodotMcpParams.text(params, "placement", "static_body")
	var axis_name: Variant = GodotMcpParams.text(params, "axis", "longest")
	for value in [node_path, shape_name, placement, axis_name]:
		if value is GodotMcpCommandError:
			return value
	if not shape_name in SHAPES:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown shape \"%s\"" % shape_name, "shape is one of %s." % ", ".join(SHAPES))
	if not placement in PLACEMENTS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown placement \"%s\"" % placement, "placement is static_body or sibling.")
	if not AXES.has(axis_name):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Unknown axis \"%s\"" % axis_name, "axis is longest, x, y or z.")
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if not node is MeshInstance3D or (node as MeshInstance3D).mesh == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is not a MeshInstance3D with a mesh" % node_path, "Pass a MeshInstance3D; for CSG nodes set use_collision instead, and for imported models use the import settings.")
	if placement == "sibling" and node == scene_root:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The scene root has no siblings", "Use placement static_body.")
	_scene_root = scene_root
	_instance = node
	var mesh := _instance.mesh
	var offset := Transform3D.IDENTITY
	var shapes: Array[Shape3D] = []
	match shape_name:
		"trimesh":
			shapes.append(mesh.create_trimesh_shape())
		"convex":
			shapes.append(mesh.create_convex_shape(true, false))
		"simplified_convex":
			shapes.append(mesh.create_convex_shape(true, true))
		"multiple_convex":
			shapes.append_array(_decomposed(mesh))
		_:
			var fitted := _fitted_primitive(mesh, shape_name, AXES[axis_name])
			shapes.append(fitted["shape"])
			offset = fitted["offset"]
	shapes = shapes.filter(func(shape: Shape3D) -> bool: return shape != null)
	if shapes.is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not build a %s shape from the mesh of \"%s\"" % [shape_name, node_path], "Try another shape, such as box or convex.")
	action_name = "MCP: Add %s collision to %s" % [shape_name, node.name]
	if placement == "static_body":
		_add_body_with(shapes, offset)
	else:
		_add_siblings(shapes, offset)
	_save_changes_inside_instances(_instance, scene_root)
	return null


func finish() -> Dictionary:
	var measured := GodotMcpBounds.measure(_instance)
	var collision_size := _collision_size()
	return {
		"path": GodotMcpNodeLocator.path_of(_scene_root, _instance),
		"shapes": _created.map(func(shape: CollisionShape3D) -> Dictionary: return {"path": GodotMcpNodeLocator.path_of(_scene_root, shape), "type": shape.shape.get_class()}),
		"mesh_size": _size_text((measured["visual"] as AABB).size),
		"collision_size": _size_text(collision_size),
		"editable_children": _editable_children,
	}


func _add_body_with(shapes: Array[Shape3D], offset: Transform3D) -> void:
	var body := StaticBody3D.new()
	body.name = "StaticBody3D"
	body.transform = offset
	changes.add_do_call(_instance, &"add_child", [body, true])
	changes.add_do_call(body, &"set_owner", [_scene_root])
	for shape in shapes:
		var collision := _collision_for(shape)
		body.add_child(collision, true)
		changes.add_do_call(collision, &"set_owner", [_scene_root])
		_created.append(collision)
	changes.add_do_reference(body)
	changes.add_undo_call(_instance, &"remove_child", [body])


func _add_siblings(shapes: Array[Shape3D], offset: Transform3D) -> void:
	var parent := _instance.get_parent()
	for shape in shapes:
		var collision := _collision_for(shape)
		collision.transform = _instance.transform * offset
		changes.add_do_call(parent, &"add_child", [collision, true])
		changes.add_do_call(collision, &"set_owner", [_scene_root])
		changes.add_do_reference(collision)
		changes.add_undo_call(parent, &"remove_child", [collision])
		_created.append(collision)


func _collision_size() -> Vector3:
	var box := AABB()
	for index in _created.size():
		var collision := _created[index]
		var world := GodotMcpSpatialTransforms.global_of(collision) * collision.shape.get_debug_mesh().get_aabb()
		box = world if index == 0 else box.merge(world)
	return box.size


static func _collision_for(shape: Shape3D) -> CollisionShape3D:
	var collision := CollisionShape3D.new()
	collision.name = "CollisionShape3D"
	collision.shape = shape
	return collision


static func _decomposed(mesh: Mesh) -> Array[Shape3D]:
	var helper := MeshInstance3D.new()
	helper.mesh = mesh
	var settings := MeshConvexDecompositionSettings.new()
	settings.max_convex_hulls = MAXIMUM_CONVEX_HULLS
	settings.max_concavity = MAXIMUM_CONCAVITY
	helper.create_multiple_convex_collisions(settings)
	var shapes: Array[Shape3D] = []
	for collision in helper.find_children("*", "CollisionShape3D", true, false):
		shapes.append((collision as CollisionShape3D).shape)
	helper.free()
	return shapes


static func _fitted_primitive(mesh: Mesh, shape_name: String, requested_axis: int) -> Dictionary:
	var bounds := mesh.get_aabb()
	var offset := Transform3D(Basis.IDENTITY, bounds.get_center())
	var axis := bounds.get_longest_axis_index() if requested_axis < 0 else requested_axis
	var across := Vector3.AXIS_Y if axis == Vector3.AXIS_X else Vector3.AXIS_X
	match shape_name:
		"box":
			var box := BoxShape3D.new()
			box.size = (mesh as BoxMesh).size.maxf(MINIMUM_EXTENT) if mesh is BoxMesh else bounds.size.maxf(MINIMUM_EXTENT)
			return {"shape": box, "offset": Transform3D.IDENTITY if mesh is BoxMesh else offset}
		"sphere":
			var sphere := SphereShape3D.new()
			sphere.radius = maxf((mesh as SphereMesh).radius if mesh is SphereMesh else bounds.size[bounds.size.max_axis_index()] / 2.0, MINIMUM_EXTENT)
			return {"shape": sphere, "offset": Transform3D.IDENTITY if mesh is SphereMesh else offset}
		"capsule":
			var capsule := CapsuleShape3D.new()
			if mesh is CapsuleMesh:
				capsule.radius = maxf((mesh as CapsuleMesh).radius, MINIMUM_EXTENT)
				capsule.height = (mesh as CapsuleMesh).height
				return {"shape": capsule, "offset": Transform3D.IDENTITY}
			capsule.radius = maxf(bounds.size[across] / 2.0, MINIMUM_EXTENT)
			capsule.height = bounds.size[axis]
			return {"shape": capsule, "offset": _turned_toward(axis, offset)}
	var cylinder := CylinderShape3D.new()
	if mesh is CylinderMesh:
		cylinder.height = maxf((mesh as CylinderMesh).height, MINIMUM_EXTENT)
		cylinder.radius = ((mesh as CylinderMesh).top_radius + (mesh as CylinderMesh).bottom_radius) / 2.0
		return {"shape": cylinder, "offset": Transform3D.IDENTITY}
	cylinder.height = maxf(bounds.size[axis], MINIMUM_EXTENT)
	cylinder.radius = bounds.size[across] / 2.0
	return {"shape": cylinder, "offset": _turned_toward(axis, offset)}


static func _turned_toward(axis: int, offset: Transform3D) -> Transform3D:
	if axis == Vector3.AXIS_X:
		return Transform3D(Basis(Vector3(0, 0, 1), PI / 2.0), offset.origin)
	if axis == Vector3.AXIS_Z:
		return Transform3D(Basis(Vector3(1, 0, 0), -PI / 2.0), offset.origin)
	return offset


static func _size_text(size: Vector3) -> String:
	return "Vector3(%s, %s, %s)" % [GodotMcpNumberText.of(size.x, 3), GodotMcpNumberText.of(size.y, 3), GodotMcpNumberText.of(size.z, 3)]
