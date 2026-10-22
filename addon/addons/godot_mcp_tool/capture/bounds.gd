extends RefCounted

const SpatialTransforms := preload("../scene/spatial_transforms.gd")


static func measure(node: Node) -> Dictionary:
	var visual := AABB()
	var visual_count := 0
	var collision := AABB()
	var collision_count := 0
	for subtree_node in _subtree(node):
		if subtree_node is GeometryInstance3D and not _is_particles(subtree_node):
			var local_bounds := _local_bounds(subtree_node)
			if local_bounds.size != Vector3.ZERO:
				var world_bounds := SpatialTransforms.global_of(subtree_node) * local_bounds
				visual = world_bounds if visual_count == 0 else visual.merge(world_bounds)
				visual_count += 1
		elif subtree_node is CollisionShape3D and (subtree_node as CollisionShape3D).shape != null:
			var shape_bounds := SpatialTransforms.global_of(subtree_node) * (subtree_node as CollisionShape3D).shape.get_debug_mesh().get_aabb()
			collision = shape_bounds if collision_count == 0 else collision.merge(shape_bounds)
			collision_count += 1
	var measured := visual if visual_count > 0 else collision
	if visual_count == 0 and collision_count == 0:
		measured = AABB(SpatialTransforms.global_of(node).origin, Vector3.ZERO)
	return {"aabb": measured, "visual_count": visual_count, "collision_count": collision_count}


static func _subtree(node: Node) -> Array[Node3D]:
	var nodes: Array[Node3D] = []
	if node is Node3D:
		nodes.append(node)
	for child in node.get_children():
		nodes.append_array(_subtree(child))
	return nodes


static func _is_particles(geometry: GeometryInstance3D) -> bool:
	return geometry is GPUParticles3D or geometry is CPUParticles3D


static func _local_bounds(geometry: GeometryInstance3D) -> AABB:
	if geometry is CSGBox3D:
		var size := (geometry as CSGBox3D).size
		return AABB(-size / 2.0, size)
	if geometry is CSGSphere3D:
		var radius := (geometry as CSGSphere3D).radius
		return AABB(Vector3.ONE * -radius, Vector3.ONE * radius * 2.0)
	if geometry is CSGCylinder3D:
		var cylinder := geometry as CSGCylinder3D
		return AABB(Vector3(-cylinder.radius, -cylinder.height / 2.0, -cylinder.radius), Vector3(cylinder.radius * 2.0, cylinder.height, cylinder.radius * 2.0))
	if geometry is CSGTorus3D:
		var torus := geometry as CSGTorus3D
		var half_thickness := (torus.outer_radius - torus.inner_radius) / 2.0
		return AABB(Vector3(-torus.outer_radius, -half_thickness, -torus.outer_radius), Vector3(torus.outer_radius * 2.0, half_thickness * 2.0, torus.outer_radius * 2.0))
	if geometry is CSGMesh3D:
		var mesh := (geometry as CSGMesh3D).mesh
		return mesh.get_aabb() if mesh != null else AABB()
	return geometry.get_aabb()
