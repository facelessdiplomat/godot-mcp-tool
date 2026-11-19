extends RefCounted

const GodotMcpNodeFactory := preload("../scene/node_factory.gd")


static func plan(scene_root: Node, apply_transforms: bool) -> Dictionary:
	var items: Array = []
	for child in scene_root.get_children():
		_collect(child, apply_transforms, items)
	var seen := {}
	var duplicates: Array = []
	for item: Dictionary in items:
		if seen.has(item["name"]) and not item["name"] in duplicates:
			duplicates.append(item["name"])
		seen[item["name"]] = true
	return {"items": items, "duplicates": duplicates}


static func apply(library: MeshLibrary, planned: Array) -> Dictionary:
	var earlier_ids := library.get_item_list()
	var items_by_id := {}
	var order: Array = []
	for item: Dictionary in planned:
		var id := library.find_item_by_name(item["name"])
		var added := id < 0
		if added:
			id = library.get_last_unused_item_id()
			library.create_item(id)
			library.set_item_name(id, item["name"])
		library.set_item_mesh(id, item["mesh"])
		library.set_item_mesh_transform(id, item["mesh_transform"])
		library.set_item_mesh_cast_shadow(id, item["cast_shadow"])
		library.set_item_shapes(id, item["shapes"])
		library.set_item_navigation_mesh(id, item["navigation_mesh"])
		library.set_item_navigation_mesh_transform(id, item["navigation_transform"])
		if not items_by_id.has(id):
			order.append(id)
		var was_added: bool = items_by_id.get(id, {}).get("added", added)
		items_by_id[id] = {
			"id": id,
			"name": item["name"],
			"mesh": GodotMcpNodeFactory.display_class(item["mesh"]),
			"shapes": (item["shapes"] as Array).size() / 2,
			"navigation": item["navigation_mesh"] != null,
			"added": was_added,
		}
	var left: Array = []
	for id in earlier_ids:
		if not items_by_id.has(id):
			left.append({"id": id, "name": library.get_item_name(id)})
	return {"items": order.map(func(id: int) -> Dictionary: return items_by_id[id]), "left": left}


static func _collect(node: Node, apply_transforms: bool, items: Array) -> void:
	var block := node as MeshInstance3D
	if block == null:
		for child in node.get_children():
			_collect(child, apply_transforms, items)
		return
	if block.mesh == null:
		return
	var placement := block.transform if apply_transforms else Transform3D.IDENTITY
	var navigation := _navigation_of(block)
	items.append({
		"name": str(block.name),
		"mesh": _mesh_of(block),
		"mesh_transform": placement,
		"cast_shadow": block.cast_shadow,
		"shapes": _shapes_of(block, placement),
		"navigation_mesh": navigation.get("mesh"),
		"navigation_transform": navigation.get("transform", Transform3D.IDENTITY),
	})


static func _mesh_of(block: MeshInstance3D) -> Mesh:
	var mesh := block.mesh.duplicate() as Mesh
	for surface in mesh.get_surface_count():
		var material := block.get_surface_override_material(surface)
		if material == null:
			material = block.material_override
		if material != null:
			mesh.surface_set_material(surface, material)
	return mesh


static func _shapes_of(block: MeshInstance3D, placement: Transform3D) -> Array:
	var shapes: Array = []
	for child in block.get_children():
		var body := child as StaticBody3D
		if body == null:
			continue
		for owner_id in body.get_shape_owners():
			if body.is_shape_owner_disabled(owner_id):
				continue
			var shape_transform := placement * body.transform * body.shape_owner_get_transform(owner_id)
			for index in body.shape_owner_get_shape_count(owner_id):
				var shape := body.shape_owner_get_shape(owner_id, index)
				if shape != null:
					shapes.append_array([shape, shape_transform])
	return shapes


static func _navigation_of(block: MeshInstance3D) -> Dictionary:
	for child in block.get_children():
		var region := child as NavigationRegion3D
		if region != null and region.navigation_mesh != null:
			return {"mesh": region.navigation_mesh, "transform": region.transform}
	return {}
