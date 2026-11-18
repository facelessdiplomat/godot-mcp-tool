extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGridCells := preload("../../scene/grid_cells.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")

const DEFAULT_MAX_CELLS := 100

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Level/Ground\"")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var max_cells: Variant = GodotMcpParams.whole_number(params, "max_cells", DEFAULT_MAX_CELLS)
	var from: Variant = GodotMcpGridCells.cell_3d(params.get("from"), "\"from\"") if params.has("from") else null
	var to: Variant = GodotMcpGridCells.cell_3d(params.get("to"), "\"to\"") if params.has("to") else null
	for value in [node_path, scene_path, max_cells, from, to]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _context.scenes.resolve_for_reading(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var snapshot := resolved as GodotMcpSceneSnapshot
	var node := GodotMcpNodeLocator.find(snapshot.root, node_path)
	var error: GodotMcpCommandError = null
	if node == null:
		error = GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(snapshot.root, node_path))
	elif not node is GridMap:
		error = GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is %s, not a GridMap" % [node_path, GodotMcpNodeFactory.display_class(node)], "Find GridMap nodes with node_find and the type GridMap.")
	if error != null:
		snapshot.release()
		return error
	var result := _describe(node as GridMap, from, to, max_cells)
	result["scene"] = snapshot.scene_path
	result["path"] = GodotMcpNodeLocator.path_of(snapshot.root, node)
	snapshot.release()
	return result


func _describe(grid: GridMap, from: Variant, to: Variant, max_cells: int) -> Dictionary:
	var library := grid.mesh_library
	var cells: Array[Vector3i] = []
	for position in grid.get_used_cells():
		if _inside(position, from, to):
			cells.append(position)
	cells.sort_custom(_comes_first)
	var counts := {}
	var low := Vector3i.ZERO
	var high := Vector3i.ZERO
	for index in cells.size():
		var position := cells[index]
		var item := grid.get_cell_item(position)
		counts[item] = int(counts.get(item, 0)) + 1
		low = position if index == 0 else low.min(position)
		high = position if index == 0 else high.max(position)
	var item_ids: Array = counts.keys()
	item_ids.sort()
	var result := {
		"library": library.resource_path if library != null else "",
		"items": _items_of(library),
		"cell_size": _context.codec.encode(grid.cell_size),
		"count": cells.size(),
		"counts": item_ids.map(func(item: int) -> Dictionary: return {"item": item, "name": _item_name(library, item), "count": counts[item]}),
		"cells": cells.slice(0, max_cells).map(func(position: Vector3i) -> Dictionary: return _cell_entry(grid, position)),
		"more": cells.size() > max_cells,
	}
	if not cells.is_empty():
		result["from"] = [low.x, low.y, low.z]
		result["to"] = [high.x, high.y, high.z]
	return result


func _cell_entry(grid: GridMap, position: Vector3i) -> Dictionary:
	var item := grid.get_cell_item(position)
	return {"position": [position.x, position.y, position.z], "item": item, "name": _item_name(grid.mesh_library, item), "orientation": grid.get_cell_item_orientation(position)}


static func _inside(position: Vector3i, from: Variant, to: Variant) -> bool:
	if from == null or to == null:
		return true
	var low := (from as Vector3i).min(to)
	var high := (from as Vector3i).max(to)
	return position.clamp(low, high) == position


static func _comes_first(first: Vector3i, second: Vector3i) -> bool:
	if first.y != second.y:
		return first.y < second.y
	if first.z != second.z:
		return first.z < second.z
	return first.x < second.x


static func _items_of(library: MeshLibrary) -> Array:
	if library == null:
		return []
	return Array(library.get_item_list()).map(func(item: int) -> Dictionary: return {"id": item, "name": library.get_item_name(item)})


static func _item_name(library: MeshLibrary, item: int) -> String:
	return library.get_item_name(item) if library != null and item in library.get_item_list() else ""
