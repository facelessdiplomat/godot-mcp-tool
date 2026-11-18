extends RefCounted

const BASE_ALTERNATIVE := 0
const LISTED_TILES := 30


static func describe_all(tile_set: TileSet) -> Array:
	var sources: Array = []
	for index in tile_set.get_source_count():
		var source_id := tile_set.get_source_id(index)
		sources.append(describe(tile_set, source_id))
	return sources


static func describe(tile_set: TileSet, source_id: int) -> Dictionary:
	var source := tile_set.get_source(source_id)
	if source is TileSetScenesCollectionSource:
		return {"id": source_id, "kind": "scenes", "tiles": (source as TileSetScenesCollectionSource).get_scene_tiles_count()}
	var atlas := source as TileSetAtlasSource
	var grid := atlas.get_atlas_grid_size()
	return {
		"id": source_id,
		"kind": "atlas",
		"texture": atlas.texture.resource_path if atlas.texture != null else "",
		"columns": grid.x,
		"rows": grid.y,
		"tiles": atlas.get_tiles_count(),
		"collision_tiles": _tiles_with_collision(tile_set, atlas),
	}


static func names(tile_set: TileSet) -> String:
	return ", ".join(describe_all(tile_set).map(func(source: Dictionary) -> String: return _name_of(source)))


static func _name_of(source: Dictionary) -> String:
	if source["kind"] != "atlas":
		return "%d (scenes)" % source["id"]
	var texture: String = source["texture"]
	return "%d (%s)" % [source["id"], "atlas" if texture.is_empty() else texture]


static func tiles_of(source: TileSetSource) -> String:
	var tiles: Array = []
	for index in mini(source.get_tiles_count(), LISTED_TILES):
		var coords := source.get_tile_id(index)
		tiles.append("[%d, %d]" % [coords.x, coords.y])
	var more := "" if source.get_tiles_count() <= LISTED_TILES else ", …"
	return ", ".join(tiles) + more


static func _tiles_with_collision(tile_set: TileSet, atlas: TileSetAtlasSource) -> int:
	var count := 0
	for index in atlas.get_tiles_count():
		var data := atlas.get_tile_data(atlas.get_tile_id(index), BASE_ALTERNATIVE)
		for physics_layer in tile_set.get_physics_layers_count():
			if data.get_collision_polygons_count(physics_layer) > 0:
				count += 1
				break
	return count
