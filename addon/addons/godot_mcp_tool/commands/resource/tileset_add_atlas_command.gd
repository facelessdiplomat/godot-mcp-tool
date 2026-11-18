extends "../command.gd"

const GodotMcpGridCells := preload("../../scene/grid_cells.gd")
const GodotMcpParams := preload("../params.gd")

const PHYSICS_LAYER := 0
const BASE_ALTERNATIVE := 0
const TILE_SET_EXTENSIONS := ["tres", "res"]


func execute(params: Dictionary) -> Variant:
	var tile_set_path: Variant = GodotMcpParams.required_text(params, "path", "\"res://tiles/ground.tres\"")
	var texture_path: Variant = GodotMcpParams.required_text(params, "texture", "\"res://tiles.png\"")
	var tile_size: Variant = _pixels(params, "tile_size", null)
	var margins: Variant = _pixels(params, "margins", Vector2i.ZERO)
	var separation: Variant = _pixels(params, "separation", Vector2i.ZERO)
	var collision: Variant = GodotMcpParams.flag(params, "collision", false)
	for value in [tile_set_path, texture_path, tile_size, margins, separation, collision]:
		if value is GodotMcpCommandError:
			return value
	if not (tile_set_path as String).get_extension() in TILE_SET_EXTENSIONS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "A tile set is saved as a .tres or .res file, not %s" % tile_set_path, "Example: \"res://tiles/ground.tres\"")
	if (tile_size as Vector2i).x <= 0 or (tile_size as Vector2i).y <= 0:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"tile_size\" must be at least one pixel each way", "Give the size of one tile in pixels, such as [32, 32].")
	if (margins as Vector2i).x < 0 or (margins as Vector2i).y < 0 or (separation as Vector2i).x < 0 or (separation as Vector2i).y < 0:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"margins\" and \"separation\" are pixels, 0 or more")
	var texture: Variant = _texture_at(texture_path)
	if texture is GodotMcpCommandError:
		return texture
	var atlas := TileSetAtlasSource.new()
	atlas.texture = texture
	atlas.margins = margins
	atlas.separation = separation
	atlas.texture_region_size = tile_size
	var grid := atlas.get_atlas_grid_size()
	if grid.x <= 0 or grid.y <= 0:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Tiles of %dx%d pixels do not fit in %s, which is %dx%d" % [tile_size.x, tile_size.y, texture_path, (texture as Texture2D).get_width(), (texture as Texture2D).get_height()], "Give the size of one tile in pixels, such as [32, 32].")
	var tile_set: Variant = _tile_set_at(tile_set_path, tile_size)
	if tile_set is GodotMcpCommandError:
		return tile_set
	var created := not ResourceLoader.exists(tile_set_path)
	var tiles := _create_opaque_tiles(atlas, texture, grid, tile_size, margins, separation)
	var source_id := (tile_set as TileSet).add_source(atlas)
	if collision:
		_add_collision_squares(tile_set, atlas, tiles, tile_size)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path((tile_set_path as String).get_base_dir()))
	var save_error := ResourceSaver.save(tile_set, tile_set_path)
	if save_error != OK:
		(tile_set as TileSet).remove_source(source_id)
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not save %s: %s" % [tile_set_path, error_string(save_error)])
	return {
		"path": tile_set_path,
		"created": created,
		"source_id": source_id,
		"texture": texture_path,
		"tile_size": [tile_size.x, tile_size.y],
		"columns": grid.x,
		"rows": grid.y,
		"tiles": tiles.size(),
		"skipped": grid.x * grid.y - tiles.size(),
		"collision": tiles.size() if collision else 0,
	}


static func _texture_at(texture_path: String) -> Variant:
	if not ResourceLoader.exists(texture_path):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "There is no texture at %s" % texture_path, "Put the image in the project and call editor_rescan, so that the editor imports it.")
	var texture := ResourceLoader.load(texture_path) as Texture2D
	if texture == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is not a texture" % texture_path)
	return texture


static func _tile_set_at(tile_set_path: String, tile_size: Vector2i) -> Variant:
	if not ResourceLoader.exists(tile_set_path):
		var tile_set := TileSet.new()
		tile_set.tile_size = tile_size
		return tile_set
	var loaded := ResourceLoader.load(tile_set_path)
	if not loaded is TileSet:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is a %s, not a TileSet" % [tile_set_path, loaded.get_class() if loaded != null else "file Godot cannot load"], "Give a new path to create a TileSet there.")
	return loaded


static func _create_opaque_tiles(atlas: TileSetAtlasSource, texture: Texture2D, grid: Vector2i, tile_size: Vector2i, margins: Vector2i, separation: Vector2i) -> Array[Vector2i]:
	var image := texture.get_image()
	if image != null and image.is_compressed():
		image.decompress()
	var tiles: Array[Vector2i] = []
	for y in grid.y:
		for x in grid.x:
			var coords := Vector2i(x, y)
			var region := Rect2i(margins + coords * (tile_size + separation), tile_size)
			if image != null and image.get_region(region).is_invisible():
				continue
			atlas.create_tile(coords)
			tiles.append(coords)
	return tiles


static func _add_collision_squares(tile_set: TileSet, atlas: TileSetAtlasSource, tiles: Array[Vector2i], tile_size: Vector2i) -> void:
	if tile_set.get_physics_layers_count() == 0:
		tile_set.add_physics_layer()
	var half := Vector2(tile_size) / 2.0
	var square := PackedVector2Array([-half, Vector2(half.x, -half.y), half, Vector2(-half.x, half.y)])
	for coords in tiles:
		var data := atlas.get_tile_data(coords, BASE_ALTERNATIVE)
		data.add_collision_polygon(PHYSICS_LAYER)
		data.set_collision_polygon_points(PHYSICS_LAYER, data.get_collision_polygons_count(PHYSICS_LAYER) - 1, square)


static func _pixels(params: Dictionary, key: String, default_value: Variant) -> Variant:
	if not params.has(key) and default_value != null:
		return default_value
	var parsed: Variant = GodotMcpGridCells.cell_2d(params.get(key), "\"%s\"" % key)
	if parsed is GodotMcpCommandError:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"%s\" must be [width, height] in whole pixels" % key, "Example: [32, 32]")
	return parsed
