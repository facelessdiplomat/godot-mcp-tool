extends "../command.gd"

const GodotMcpBounds := preload("../../capture/bounds.gd")
const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpInstancedScenes := preload("../../scene/instanced_scenes.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpRayProbe := preload("../../scene/ray_probe.gd")
const GodotMcpSpatialTransforms := preload("../../scene/spatial_transforms.gd")

const START_ABOVE_BOTTOM := 1.0
const MAXIMUM_DROP := 500.0
const PRECISION := 0.001
const ANGLE_PRECISION := 0.01
const MAXIMUM_SAMPLES := 64
const FACING_DOWN_MARGIN := 0.001
const FACE_NORMALS: Array[Vector3] = [Vector3.LEFT, Vector3.RIGHT, Vector3.DOWN, Vector3.UP, Vector3.FORWARD, Vector3.BACK]

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var paths: Variant = GodotMcpParams.text_list(params, "paths")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var align: Variant = GodotMcpParams.flag(params, "align", false)
	for value in [paths, scene_path, align]:
		if value is GodotMcpCommandError:
			return value
	if (paths as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"paths\" needs at least one node", "Example: {\"paths\": [\"Crate\", \"Props/Barrel\"]}")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var nodes: Array[Node3D] = []
	for path in paths:
		var node := GodotMcpNodeLocator.find(scene_root, path)
		if node == null:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % path, GodotMcpNodeLocator.not_found_hint(scene_root, path))
		if node == scene_root or not node is Node3D:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is %s, so it cannot be placed on the floor" % [path, "the scene root" if node == scene_root else GodotMcpNodeFactory.display_class(node)], "Pass 3D nodes below the scene root.")
		nodes.append(node)
	var tree := scene_root.get_tree()
	if tree != null:
		await tree.process_frame
		await tree.physics_frame
	var changes := GodotMcpChangeSet.new()
	var placed: Array = []
	var editable_children: Array = []
	for node in nodes:
		var outcome := _plan_snap(node, scene_root, changes, align)
		placed.append(outcome)
		if outcome["moved"]:
			editable_children.append_array(GodotMcpInstancedScenes.turn_on_editable_children_for(node, scene_root, changes))
	if not changes.is_empty():
		_context.history.record("MCP: Snap to floor", scene_root, [changes])
	return {"scene": scene_root.scene_file_path, "nodes": placed, "editable_children": editable_children}


func _plan_snap(node: Node3D, scene_root: Node, changes: GodotMcpChangeSet, align: bool) -> Dictionary:
	var path := GodotMcpNodeLocator.path_of(scene_root, node)
	var global := GodotMcpSpatialTransforms.global_of(node)
	var turned := global
	var tilt_degrees := 0.0
	if align:
		var ground := _ground_under(node, scene_root)
		if ground.is_empty():
			return _nothing_below(path)
		var up := global.basis.y.normalized()
		var normal := (ground["normal"] as Vector3).normalized()
		tilt_degrees = rad_to_deg(up.angle_to(normal))
		if snappedf(tilt_degrees, ANGLE_PRECISION) > 0.0:
			turned = Transform3D(Basis(Quaternion(up, normal)) * global.basis, global.origin)
	var contact := _first_contact(node, scene_root, turned * global.affine_inverse())
	if contact.is_empty():
		return _nothing_below(path)
	var rise := snappedf(-float(contact["gap"]), PRECISION)
	var target := Transform3D(turned.basis, turned.origin + Vector3.UP * rise)
	var parent_global := GodotMcpSpatialTransforms.global_of(node.get_parent()) if not node.top_level else Transform3D.IDENTITY
	var local := parent_global.affine_inverse() * target
	if align:
		changes.add_do_property(node, &"transform", local)
		changes.add_undo_property(node, &"transform", node.transform)
	else:
		changes.add_do_property(node, &"position", local.origin)
		changes.add_undo_property(node, &"position", node.position)
	var hit: Dictionary = contact["hit"]
	var resting_on: Node = hit["node"]
	var outcome := {
		"path": path,
		"moved": true,
		"rise": rise,
		"on": GodotMcpNodeLocator.path_of(scene_root, resting_on) if resting_on != null else "",
		"by": hit["by"],
		"position": _context.codec.encode(target.origin.snappedf(PRECISION)),
	}
	if align:
		outcome["tilt"] = snappedf(tilt_degrees, ANGLE_PRECISION)
		outcome["rotation"] = _context.codec.encode(_rotation_degrees_of(local.basis))
	return outcome


func _nothing_below(path: String) -> Dictionary:
	return {"path": path, "moved": false, "reason": "there is nothing below it within %d m" % int(MAXIMUM_DROP)}


func _ground_under(node: Node3D, scene_root: Node) -> Dictionary:
	var from := _bottom_center_of(_downward_points(node, Transform3D.IDENTITY)) + Vector3.UP * START_ABOVE_BOTTOM
	return GodotMcpRayProbe.cast(scene_root, from, from + Vector3.DOWN * MAXIMUM_DROP, [node])


func _first_contact(node: Node3D, scene_root: Node, movement: Transform3D) -> Dictionary:
	var samples := _lowest(_downward_points(node, movement))
	var nearest := {}
	for point in samples:
		var from := point + Vector3.UP * START_ABOVE_BOTTOM
		var hit := GodotMcpRayProbe.cast(scene_root, from, from + Vector3.DOWN * MAXIMUM_DROP, [node])
		if hit.is_empty():
			continue
		var gap := point.y - (hit["position"] as Vector3).y
		if nearest.is_empty() or gap < float(nearest["gap"]):
			nearest = {"gap": gap, "hit": hit}
	return nearest


static func _downward_points(node: Node3D, movement: Transform3D) -> PackedVector3Array:
	var points := PackedVector3Array()
	for oriented in GodotMcpBounds.oriented_boxes(node):
		var transform := movement * (oriented["transform"] as Transform3D)
		var box: AABB = oriented["box"]
		if box.size == Vector3.ZERO:
			points.append(transform * box.position)
			continue
		for normal in FACE_NORMALS:
			if (transform.basis.inverse().transposed() * normal).normalized().y < -FACING_DOWN_MARGIN:
				points.append_array(_face_points(transform, box, normal))
	return points


static func _face_points(transform: Transform3D, box: AABB, normal: Vector3) -> PackedVector3Array:
	var points := PackedVector3Array()
	var axis := normal.abs().max_axis_index()
	var fractions: Array[float] = [0.0, 0.5, 1.0]
	for first in fractions:
		for second in fractions:
			var fraction := Vector3.ZERO
			fraction[axis] = 1.0 if normal[axis] > 0.0 else 0.0
			fraction[(axis + 1) % 3] = first
			fraction[(axis + 2) % 3] = second
			points.append(transform * (box.position + box.size * fraction))
	return points


static func _lowest(points: PackedVector3Array) -> PackedVector3Array:
	if points.size() <= MAXIMUM_SAMPLES:
		return points
	var sorted: Array[Vector3] = []
	sorted.assign(Array(points))
	sorted.sort_custom(func(first: Vector3, second: Vector3) -> bool: return first.y < second.y)
	sorted.resize(MAXIMUM_SAMPLES)
	return PackedVector3Array(sorted)


static func _bottom_center_of(points: PackedVector3Array) -> Vector3:
	var box := AABB(points[0], Vector3.ZERO)
	for point in points:
		box = box.expand(point)
	var center := box.get_center()
	return Vector3(center.x, box.position.y, center.z)


static func _rotation_degrees_of(basis: Basis) -> Vector3:
	var euler := basis.orthonormalized().get_euler()
	return Vector3(rad_to_deg(euler.x), rad_to_deg(euler.y), rad_to_deg(euler.z)).snappedf(ANGLE_PRECISION) + Vector3.ZERO
