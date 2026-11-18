extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGridCells := preload("../../scene/grid_cells.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneSnapshot := preload("../../scene/scene_snapshot.gd")
const GodotMcpTileSources := preload("../../scene/tile_sources.gd")

const DEFAULT_MAX_CELLS := 100

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Level/Ground\"")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var max_cells: Variant = GodotMcpParams.whole_number(params, "max_cells", DEFAULT_MAX_CELLS)
	var from: Variant = GodotMcpGridCells.cell_2d(params.get("from"), "\"from\"") if params.has("from") else null
	var to: Variant = GodotMcpGridCells.cell_2d(params.get("to"), "\"to\"") if params.has("to") else null
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
	elif not node is TileMapLayer:
		error = GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is %s, not a TileMapLayer" % [node_path, GodotMcpNodeFactory.display_class(node)], "Find TileMapLayer nodes with node_find and the type TileMapLayer.")
	if error != null:
		snapshot.release()
		return error
	var result := _describe(node as TileMapLayer, from, to, max_cells)
	result["scene"] = snapshot.scene_path
	result["path"] = GodotMcpNodeLocator.path_of(snapshot.root, node)
	snapshot.release()
	return result


func _describe(layer: TileMapLayer, from: Variant, to: Variant, max_cells: int) -> Dictionary:
	var cells: Array[Vector2i] = []
	for position in layer.get_used_cells():
		if _inside(position, from, to):
			cells.append(position)
	cells.sort_custom(_comes_first)
	var counts := {}
	var low := Vector2i.ZERO
	var high := Vector2i.ZERO
	for index in cells.size():
		var position := cells[index]
		var tile := [layer.get_cell_source_id(position), layer.get_cell_atlas_coords(position)]
		counts[tile] = int(counts.get(tile, 0)) + 1
		low = position if index == 0 else low.min(position)
		high = position if index == 0 else high.max(position)
	var tiles: Array = counts.keys()
	tiles.sort_custom(_tile_comes_first)
	var result := _describe_tile_set(layer.tile_set)
	result.merge({
		"count": cells.size(),
		"counts": tiles.map(func(tile: Array) -> Dictionary: return {"source": tile[0], "atlas": [tile[1].x, tile[1].y], "count": counts[tile]}),
		"cells": cells.slice(0, max_cells).map(func(position: Vector2i) -> Dictionary: return _cell_entry(layer, position)),
		"more": cells.size() > max_cells,
	})
	if not cells.is_empty():
		result["from"] = [low.x, low.y]
		result["to"] = [high.x, high.y]
	return result


static func _describe_tile_set(tile_set: TileSet) -> Dictionary:
	if tile_set == null:
		return {"tile_set": null, "sources": []}
	return {
		"tile_set": tile_set.resource_path,
		"tile_size": [tile_set.tile_size.x, tile_set.tile_size.y],
		"physics_layers": tile_set.get_physics_layers_count(),
		"sources": GodotMcpTileSources.describe_all(tile_set),
	}


static func _cell_entry(layer: TileMapLayer, position: Vector2i) -> Dictionary:
	var atlas := layer.get_cell_atlas_coords(position)
	return {"position": [position.x, position.y], "source": layer.get_cell_source_id(position), "atlas": [atlas.x, atlas.y], "alternative": layer.get_cell_alternative_tile(position)}


static func _inside(position: Vector2i, from: Variant, to: Variant) -> bool:
	if from == null or to == null:
		return true
	var low := (from as Vector2i).min(to)
	var high := (from as Vector2i).max(to)
	return position.clamp(low, high) == position


static func _comes_first(first: Vector2i, second: Vector2i) -> bool:
	if first.y != second.y:
		return first.y < second.y
	return first.x < second.x


static func _tile_comes_first(first: Array, second: Array) -> bool:
	if first[0] != second[0]:
		return first[0] < second[0]
	return _comes_first(first[1], second[1])
