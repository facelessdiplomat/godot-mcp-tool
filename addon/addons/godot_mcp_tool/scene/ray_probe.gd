extends RefCounted

const GodotMcpSpatialTransforms := preload("spatial_transforms.gd")

const COLLISION_HIT := "collision"
const MESH_HIT := "mesh"
const MAXIMUM_PASSES := 16
const STEP_PAST_HIT := 0.001


static func cast(scene_root: Node, from: Vector3, to: Vector3, excluded: Array[Node]) -> Dictionary:
	var hits: Array[Dictionary] = []
	var physics_hit := _physics_hit(scene_root, from, to, excluded)
	if not physics_hit.is_empty():
		hits.append(physics_hit)
	var mesh_hit := _mesh_hit(scene_root, from, to, excluded)
	if not mesh_hit.is_empty():
		hits.append(mesh_hit)
	if hits.is_empty():
		return {}
	hits.sort_custom(func(first: Dictionary, second: Dictionary) -> bool: return from.distance_to(first["position"]) < from.distance_to(second["position"]))
	return hits[0]


static func _physics_hit(scene_root: Node, from: Vector3, to: Vector3, excluded: Array[Node]) -> Dictionary:
	var world := scene_root.get_viewport().find_world_3d() if scene_root.is_inside_tree() else null
	if world == null:
		return {}
	var space := world.direct_space_state
	if space == null:
		return {}
	var direction := (to - from).normalized()
	var start := from
	for pass_number in MAXIMUM_PASSES:
		var query := PhysicsRayQueryParameters3D.create(start, to)
		var result := space.intersect_ray(query)
		if result.is_empty():
			return {}
		var collider := result["collider"] as Node
		if collider != null and _is_excluded(collider, excluded):
			start = (result["position"] as Vector3) + direction * STEP_PAST_HIT
			continue
		return {"position": result["position"], "normal": result["normal"], "node": collider, "by": COLLISION_HIT}
	return {}


static func _mesh_hit(scene_root: Node, from: Vector3, to: Vector3, excluded: Array[Node]) -> Dictionary:
	var nearest := {}
	var nearest_distance := INF
	var direction := (to - from).normalized()
	for node in _visible_meshes(scene_root):
		if _is_excluded(node, excluded):
			continue
		var mesh := _mesh_of(node)
		if mesh == null:
			continue
		var triangles := mesh.generate_triangle_mesh()
		if triangles == null:
			continue
		var transform := GodotMcpSpatialTransforms.global_of(node)
		var inverse := transform.affine_inverse()
		var hit := triangles.intersect_segment(inverse * from, inverse * to)
		if hit.is_empty():
			continue
		var position := transform * (hit["position"] as Vector3)
		var distance := from.distance_to(position)
		if distance >= nearest_distance:
			continue
		nearest_distance = distance
		var normal := (transform.basis.inverse().transposed() * (hit["normal"] as Vector3)).normalized()
		if normal.dot(direction) > 0.0:
			normal = -normal
		nearest = {"position": position, "normal": normal, "node": node, "by": MESH_HIT}
	return nearest


static func _visible_meshes(node: Node) -> Array[Node3D]:
	var meshes: Array[Node3D] = []
	if node is MeshInstance3D and (node as MeshInstance3D).mesh != null and (node as Node3D).is_visible_in_tree():
		meshes.append(node)
	elif node is CSGShape3D and (node as CSGShape3D).is_root_shape() and (node as Node3D).is_visible_in_tree():
		meshes.append(node)
	for child in node.get_children():
		meshes.append_array(_visible_meshes(child))
	return meshes


static func _mesh_of(node: Node3D) -> Mesh:
	if node is MeshInstance3D:
		return (node as MeshInstance3D).mesh
	var meshes := (node as CSGShape3D).get_meshes()
	return meshes[1] as Mesh if meshes.size() >= 2 else null


static func _is_excluded(node: Node, excluded: Array[Node]) -> bool:
	for excluded_node in excluded:
		if node == excluded_node or excluded_node.is_ancestor_of(node):
			return true
	return false
