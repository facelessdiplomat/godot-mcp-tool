extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGridCells := preload("../../scene/grid_cells.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")

const LARGEST_ORIENTATION := 23
const ITEM_KEY := "item"
const ORIENTATION_KEY := "orientation"

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Level/Ground\"")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var boxes: Variant = GodotMcpGridCells.listed(params, "boxes")
	var cells: Variant = GodotMcpGridCells.listed(params, "cells")
	for value in [node_path, scene_path, boxes, cells]:
		if value is GodotMcpCommandError:
			return value
	if (boxes as Array).is_empty() and (cells as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Give \"cells\" or \"boxes\" to change", "Example: {\"boxes\": [{\"from\": [-4, 0, -4], \"to\": [3, 0, 3], \"item\": \"Floor\"}]}")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var grid: Variant = _grid_map_at(scene_root, node_path)
	if grid is GodotMcpCommandError:
		return grid
	var planned := {}
	for index in (boxes as Array).size():
		var outcome: Variant = _plan_box(boxes[index], "boxes[%d]" % index, (grid as GridMap).mesh_library, planned)
		if outcome is GodotMcpCommandError:
			return outcome
	for index in (cells as Array).size():
		var outcome: Variant = _plan_cell(cells[index], "cells[%d]" % index, (grid as GridMap).mesh_library, planned)
		if outcome is GodotMcpCommandError:
			return outcome
	return _apply(grid, scene_root, planned)


func _apply(grid: GridMap, scene_root: Node, planned: Dictionary) -> Dictionary:
	var changes := GodotMcpChangeSet.new()
	var set_count := 0
	var erased := 0
	var unchanged := 0
	for position in planned:
		var target: Array = planned[position]
		var old_item := grid.get_cell_item(position)
		var old_orientation := maxi(grid.get_cell_item_orientation(position), 0)
		if old_item == target[0] and (old_item == GridMap.INVALID_CELL_ITEM or old_orientation == target[1]):
			unchanged += 1
			continue
		changes.add_do_call(grid, &"set_cell_item", [position, target[0], target[1]])
		changes.add_undo_call(grid, &"set_cell_item", [position, old_item, old_orientation])
		if target[0] == GridMap.INVALID_CELL_ITEM:
			erased += 1
		else:
			set_count += 1
	if not changes.is_empty():
		_context.history.record("MCP: Set GridMap cells", scene_root, [changes])
	return {
		"scene": scene_root.scene_file_path,
		"path": GodotMcpNodeLocator.path_of(scene_root, grid),
		"set": set_count,
		"erased": erased,
		"unchanged": unchanged,
		"count": grid.get_used_cells().size(),
	}


func _grid_map_at(scene_root: Node, node_path: String) -> Variant:
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if not node is GridMap:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is %s, not a GridMap" % [node_path, GodotMcpNodeFactory.display_class(node)], "Find GridMap nodes with node_find and the type GridMap.")
	if (node as GridMap).mesh_library == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has no mesh library to take blocks from" % node_path, "Give it one with node_set_properties, such as {\"mesh_library\": \"res://blocks.tres\"}.")
	return node


func _plan_box(box: Variant, label: String, library: MeshLibrary, planned: Dictionary) -> Variant:
	if not box is Dictionary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be {\"from\": [x, y, z], \"to\": [x, y, z], \"item\": ...}" % label)
	var from: Variant = GodotMcpGridCells.cell_3d((box as Dictionary).get("from"), label + ".from")
	var to: Variant = GodotMcpGridCells.cell_3d((box as Dictionary).get("to"), label + ".to")
	var target: Variant = _target(box, label, library)
	for value in [from, to, target]:
		if value is GodotMcpCommandError:
			return value
	var low := (from as Vector3i).min(to)
	var high := (from as Vector3i).max(to)
	var size := high - low + Vector3i.ONE
	if planned.size() + size.x * size.y * size.z > GodotMcpGridCells.MAXIMUM_CELLS_AT_ONCE:
		return GodotMcpGridCells.too_many_cells_error()
	for x in range(low.x, high.x + 1):
		for y in range(low.y, high.y + 1):
			for z in range(low.z, high.z + 1):
				planned[Vector3i(x, y, z)] = target
	return null


func _plan_cell(cell: Variant, label: String, library: MeshLibrary, planned: Dictionary) -> Variant:
	if not cell is Dictionary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be {\"position\": [x, y, z], \"item\": ...}" % label)
	var position: Variant = GodotMcpGridCells.cell_3d((cell as Dictionary).get("position"), label + ".position")
	var target: Variant = _target(cell, label, library)
	for value in [position, target]:
		if value is GodotMcpCommandError:
			return value
	if planned.size() >= GodotMcpGridCells.MAXIMUM_CELLS_AT_ONCE:
		return GodotMcpGridCells.too_many_cells_error()
	planned[position] = target
	return null


func _target(entry: Dictionary, label: String, library: MeshLibrary) -> Variant:
	var item: Variant = _item_of(entry.get(ITEM_KEY), label, library)
	if item is GodotMcpCommandError:
		return item
	var orientation: Variant = GodotMcpGridCells.whole_number(entry.get(ORIENTATION_KEY, 0))
	if orientation == null or orientation < 0 or orientation > LARGEST_ORIENTATION:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s.orientation must be from 0 to %d" % [label, LARGEST_ORIENTATION], "0 keeps the block as it is in the mesh library.")
	return [item, orientation]


static func _item_of(value: Variant, label: String, library: MeshLibrary) -> Variant:
	if value == null or (value is String and (value as String).is_empty()):
		return GridMap.INVALID_CELL_ITEM
	var item_names: Array = Array(library.get_item_list()).map(func(item: int) -> String: return library.get_item_name(item))
	var known := ", ".join(Array(library.get_item_list()).map(func(item: int) -> String: return "%s (%d)" % [library.get_item_name(item), item]))
	if value is String:
		var named := library.find_item_by_name(value)
		if named >= 0:
			return named
		var similar := GodotMcpSimilarNames.hint(value, item_names)
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "The mesh library has no item \"%s\"%s" % [value, "" if similar.is_empty() else ". " + similar], "Its items: %s." % known)
	var number: Variant = GodotMcpGridCells.whole_number(value)
	if number != null and number in library.get_item_list():
		return number
	return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s.item must be the name or number of an item of the mesh library, or null to erase" % label, "Its items: %s." % known)
