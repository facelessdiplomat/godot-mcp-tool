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

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var paths: Variant = GodotMcpParams.text_list(params, "paths")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	for value in [paths, scene_path]:
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
		var outcome := _plan_snap(node, scene_root, changes)
		placed.append(outcome)
		if outcome["moved"]:
			editable_children.append_array(GodotMcpInstancedScenes.turn_on_editable_children_for(node, scene_root, changes))
	if not changes.is_empty():
		_context.history.record("MCP: Snap to floor", scene_root, [changes])
	return {"scene": scene_root.scene_file_path, "nodes": placed, "editable_children": editable_children}


func _plan_snap(node: Node3D, scene_root: Node, changes: GodotMcpChangeSet) -> Dictionary:
	var path := GodotMcpNodeLocator.path_of(scene_root, node)
	var bottom := _bottom_center_of(node)
	var from := bottom + Vector3.UP * START_ABOVE_BOTTOM
	var hit := GodotMcpRayProbe.cast(scene_root, from, from + Vector3.DOWN * MAXIMUM_DROP, [node])
	if hit.is_empty():
		return {"path": path, "moved": false, "reason": "there is nothing below it within %d m" % int(MAXIMUM_DROP)}
	var rise := snappedf((hit["position"] as Vector3).y - bottom.y, PRECISION)
	var global := GodotMcpSpatialTransforms.global_of(node)
	var target := global.origin + Vector3.UP * rise
	var parent_global := GodotMcpSpatialTransforms.global_of(node.get_parent()) if not node.top_level else Transform3D.IDENTITY
	changes.add_do_property(node, &"position", parent_global.affine_inverse() * target)
	changes.add_undo_property(node, &"position", node.position)
	var resting_on: Node = hit["node"]
	return {
		"path": path,
		"moved": true,
		"rise": rise,
		"on": GodotMcpNodeLocator.path_of(scene_root, resting_on) if resting_on != null else "",
		"by": hit["by"],
		"position": _context.codec.encode(target.snappedf(PRECISION)),
	}


static func _bottom_center_of(node: Node3D) -> Vector3:
	var measured := GodotMcpBounds.measure(node)
	var box: AABB = measured["collision"] if int(measured["collision_count"]) > 0 else measured["aabb"]
	var center := box.get_center()
	return Vector3(center.x, box.position.y, center.z)
