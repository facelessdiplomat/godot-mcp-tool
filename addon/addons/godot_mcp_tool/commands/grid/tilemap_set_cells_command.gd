extends "../command.gd"

const GodotMcpChangeSet := preload("../../scene/change_set.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpGridCells := preload("../../scene/grid_cells.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpTileSources := preload("../../scene/tile_sources.gd")

const NO_SOURCE := -1
const NO_TILE := Vector2i(-1, -1)
const NO_ALTERNATIVE := -1
const ATLAS_KEY := "atlas"

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var node_path: Variant = GodotMcpParams.required_text(params, "path", "\"Level/Ground\"")
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var rects: Variant = GodotMcpGridCells.listed(params, "rects")
	var cells: Variant = GodotMcpGridCells.listed(params, "cells")
	for value in [node_path, scene_path, rects, cells]:
		if value is GodotMcpCommandError:
			return value
	if (rects as Array).is_empty() and (cells as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Give \"cells\" or \"rects\" to change", "Example: {\"rects\": [{\"from\": [0, 10], \"to\": [29, 10], \"atlas\": [0, 0]}]}")
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var layer: Variant = _tile_map_layer_at(scene_root, node_path)
	if layer is GodotMcpCommandError:
		return layer
	var tile_set := (layer as TileMapLayer).tile_set
	var planned := {}
	for index in (rects as Array).size():
		var outcome: Variant = _plan_rect(rects[index], "rects[%d]" % index, tile_set, planned)
		if outcome is GodotMcpCommandError:
			return outcome
	for index in (cells as Array).size():
		var outcome: Variant = _plan_cell(cells[index], "cells[%d]" % index, tile_set, planned)
		if outcome is GodotMcpCommandError:
			return outcome
	return _apply(layer, scene_root, planned)


func _apply(layer: TileMapLayer, scene_root: Node, planned: Dictionary) -> Dictionary:
	var changes := GodotMcpChangeSet.new()
	var set_count := 0
	var erased := 0
	var unchanged := 0
	for position in planned:
		var target: Array = planned[position]
		var current := [layer.get_cell_source_id(position), layer.get_cell_atlas_coords(position), layer.get_cell_alternative_tile(position)]
		if current == target:
			unchanged += 1
			continue
		changes.add_do_call(layer, &"set_cell", [position, target[0], target[1], target[2]])
		changes.add_undo_call(layer, &"set_cell", [position, current[0], current[1], current[2]])
		if target[0] == NO_SOURCE:
			erased += 1
		else:
			set_count += 1
	if not changes.is_empty():
		_context.history.record("MCP: Set TileMapLayer cells", scene_root, [changes])
	return {
		"scene": scene_root.scene_file_path,
		"path": GodotMcpNodeLocator.path_of(scene_root, layer),
		"set": set_count,
		"erased": erased,
		"unchanged": unchanged,
		"count": layer.get_used_cells().size(),
	}


func _tile_map_layer_at(scene_root: Node, node_path: String) -> Variant:
	var node := GodotMcpNodeLocator.find(scene_root, node_path)
	if node == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % node_path, GodotMcpNodeLocator.not_found_hint(scene_root, node_path))
	if not node is TileMapLayer:
		var hint := "TileMap is deprecated; use one TileMapLayer node per layer." if node is TileMap else "Find TileMapLayer nodes with node_find and the type TileMapLayer."
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" is %s, not a TileMapLayer" % [node_path, GodotMcpNodeFactory.display_class(node)], hint)
	if (node as TileMapLayer).tile_set == null or (node as TileMapLayer).tile_set.get_source_count() == 0:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has no tiles to paint: its tile_set is empty" % node_path, "Build a TileSet from a texture with tileset_add_atlas, then give it to the layer with node_set_properties, such as {\"tile_set\": \"res://tiles/ground.tres\"}.")
	return node


func _plan_rect(rect: Variant, label: String, tile_set: TileSet, planned: Dictionary) -> Variant:
	if not rect is Dictionary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be {\"from\": [x, y], \"to\": [x, y], \"atlas\": [x, y]}" % label)
	var from: Variant = GodotMcpGridCells.cell_2d((rect as Dictionary).get("from"), label + ".from")
	var to: Variant = GodotMcpGridCells.cell_2d((rect as Dictionary).get("to"), label + ".to")
	var target: Variant = _target(rect, label, tile_set)
	for value in [from, to, target]:
		if value is GodotMcpCommandError:
			return value
	var low := (from as Vector2i).min(to)
	var high := (from as Vector2i).max(to)
	var size := high - low + Vector2i.ONE
	if planned.size() + size.x * size.y > GodotMcpGridCells.MAXIMUM_CELLS_AT_ONCE:
		return GodotMcpGridCells.too_many_cells_error()
	for x in range(low.x, high.x + 1):
		for y in range(low.y, high.y + 1):
			planned[Vector2i(x, y)] = target
	return null


func _plan_cell(cell: Variant, label: String, tile_set: TileSet, planned: Dictionary) -> Variant:
	if not cell is Dictionary:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s must be {\"position\": [x, y], \"atlas\": [x, y]}" % label)
	var position: Variant = GodotMcpGridCells.cell_2d((cell as Dictionary).get("position"), label + ".position")
	var target: Variant = _target(cell, label, tile_set)
	for value in [position, target]:
		if value is GodotMcpCommandError:
			return value
	if planned.size() >= GodotMcpGridCells.MAXIMUM_CELLS_AT_ONCE:
		return GodotMcpGridCells.too_many_cells_error()
	planned[position] = target
	return null


static func _target(entry: Dictionary, label: String, tile_set: TileSet) -> Variant:
	if not entry.has(ATLAS_KEY):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s needs \"atlas\": the tile as [column, row] in its source, or null to erase" % label)
	if entry[ATLAS_KEY] == null:
		return [NO_SOURCE, NO_TILE, NO_ALTERNATIVE]
	var source_id: Variant = _source_of(entry, label, tile_set)
	if source_id is GodotMcpCommandError:
		return source_id
	var coords: Variant = GodotMcpGridCells.cell_2d(entry[ATLAS_KEY], label + ".atlas")
	if coords is GodotMcpCommandError:
		return coords
	var source := tile_set.get_source(source_id)
	if not source.has_tile(coords):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s: source %d has no tile at [%d, %d]" % [label, source_id, coords.x, coords.y], "Its tiles: %s." % GodotMcpTileSources.tiles_of(source))
	var alternative: Variant = GodotMcpGridCells.whole_number(entry.get("alternative", 0))
	if alternative == null or not source.has_alternative_tile(coords, alternative):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s: the tile [%d, %d] of source %d has no alternative %s" % [label, coords.x, coords.y, source_id, str(entry.get("alternative"))], "0 is the tile itself.")
	return [source_id, coords, alternative]


static func _source_of(entry: Dictionary, label: String, tile_set: TileSet) -> Variant:
	if not entry.has("source"):
		if tile_set.get_source_count() == 1:
			return tile_set.get_source_id(0)
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s needs \"source\": the tile set has several sources" % label, "Its sources: %s." % GodotMcpTileSources.names(tile_set))
	var source_id: Variant = GodotMcpGridCells.whole_number(entry["source"])
	if source_id == null or not tile_set.has_source(source_id):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s: the tile set has no source %s" % [label, str(entry["source"])], "Its sources: %s." % GodotMcpTileSources.names(tile_set))
	return source_id
