extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpTileMapGetCellsCommand := preload("res://addons/godot_mcp_tool/commands/grid/tilemap_get_cells_command.gd")
const GodotMcpTileMapSetCellsCommand := preload("res://addons/godot_mcp_tool/commands/grid/tilemap_set_cells_command.gd")
const GodotMcpTileSetAddAtlasCommand := preload("res://addons/godot_mcp_tool/commands/resource/tileset_add_atlas_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const SCRATCH_TEXTURE := "user://mcp_test_tiles.res"
const SCRATCH_TILE_SET := "user://mcp_test_ground.tres"
const TILE := 32
const GRASS := Vector2i(0, 0)
const DIRT := Vector2i(1, 0)

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node2D
var _layer: TileMapLayer


func before_each() -> void:
	ResourceSaver.save(_tiles_texture(), SCRATCH_TEXTURE)
	_scenes = FakeSceneAccess.new()
	_root = Node2D.new()
	_root.name = "Level"
	_root.scene_file_path = "res://level.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_layer = TileMapLayer.new()
	_layer.name = "Ground"
	_layer.tile_set = _tile_set_with_grass_and_dirt()
	_root.add_child(_layer)
	_layer.owner = _root
	var marker := Node2D.new()
	marker.name = "Marker"
	_root.add_child(marker)
	marker.owner = _root


func after_each() -> void:
	_history.dispose()
	_scenes.release()
	for scratch in [SCRATCH_TEXTURE, SCRATCH_TILE_SET]:
		if FileAccess.file_exists(scratch):
			DirAccess.remove_absolute(scratch)


static func _tiles_texture() -> ImageTexture:
	var image := Image.create_empty(TILE * 3, TILE, false, Image.FORMAT_RGBA8)
	image.fill_rect(Rect2i(0, 0, TILE, TILE), Color.GREEN)
	image.fill_rect(Rect2i(TILE, 0, TILE, TILE), Color.SADDLE_BROWN)
	return ImageTexture.create_from_image(image)


static func _tile_set_with_grass_and_dirt() -> TileSet:
	var tile_set := TileSet.new()
	tile_set.tile_size = Vector2i(TILE, TILE)
	var atlas := TileSetAtlasSource.new()
	atlas.texture = _tiles_texture()
	atlas.texture_region_size = Vector2i(TILE, TILE)
	atlas.create_tile(GRASS)
	atlas.create_tile(DIRT)
	tile_set.add_source(atlas)
	return tile_set


func _add_atlas(params: Dictionary) -> Variant:
	return await GodotMcpTileSetAddAtlasCommand.new().execute(params)


func _set_cells(params: Dictionary) -> Variant:
	return await GodotMcpTileMapSetCellsCommand.new(_context).execute(params)


func _get_cells(params: Dictionary) -> Variant:
	return await GodotMcpTileMapGetCellsCommand.new(_context).execute(params)


func test_builds_a_tile_set_from_the_opaque_tiles_of_a_texture_with_a_collision_square_on_each() -> void:
	var result: Dictionary = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [TILE, TILE], "collision": true})
	assert_true(result["created"])
	assert_eq(result["source_id"], 0)
	assert_eq([result["columns"], result["rows"], result["tiles"], result["skipped"], result["collision"]], [3, 1, 2, 1, 2])
	var saved := ResourceLoader.load(SCRATCH_TILE_SET, "", ResourceLoader.CACHE_MODE_IGNORE) as TileSet
	assert_eq(saved.tile_size, Vector2i(TILE, TILE))
	assert_eq(saved.get_physics_layers_count(), 1)
	var atlas := saved.get_source(0) as TileSetAtlasSource
	assert_true(atlas.has_tile(DIRT))
	assert_false(atlas.has_tile(Vector2i(2, 0)))
	var square := PackedVector2Array([Vector2(-16, -16), Vector2(16, -16), Vector2(16, 16), Vector2(-16, 16)])
	assert_eq(atlas.get_tile_data(GRASS, 0).get_collision_polygon_points(0, 0), square)


func test_adds_another_atlas_to_an_existing_tile_set() -> void:
	await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [TILE, TILE], "collision": true})
	var result: Dictionary = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [TILE, TILE]})
	assert_false(result["created"])
	assert_eq(result["source_id"], 1)
	assert_eq(result["collision"], 0)
	var saved := ResourceLoader.load(SCRATCH_TILE_SET, "", ResourceLoader.CACHE_MODE_IGNORE) as TileSet
	assert_eq(saved.get_source_count(), 2)


func test_refuses_a_missing_texture_and_tiles_larger_than_the_texture() -> void:
	var missing: GodotMcpCommandError = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": "res://missing.png", "tile_size": [TILE, TILE]})
	var too_large: GodotMcpCommandError = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [TILE * 4, TILE]})
	assert_eq(missing.code, GodotMcpJsonRpc.NOT_FOUND)
	assert_eq(too_large.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_false(FileAccess.file_exists(SCRATCH_TILE_SET))


func test_refuses_tiles_without_size_and_negative_margins() -> void:
	var flat: GodotMcpCommandError = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [0, TILE]})
	var shifted: GodotMcpCommandError = await _add_atlas({"path": SCRATCH_TILE_SET, "texture": SCRATCH_TEXTURE, "tile_size": [TILE, TILE], "margins": [-1, 0]})
	assert_eq(flat.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(shifted.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_false(FileAccess.file_exists(SCRATCH_TILE_SET))


func test_paints_rects_and_cells_as_one_undo_step() -> void:
	var result: Dictionary = await _set_cells({"path": "Ground", "rects": [{"from": [0, 5], "to": [19, 5], "atlas": [0, 0]}], "cells": [{"position": [3, 4], "atlas": [1, 0]}]})
	assert_eq(result["set"], 21)
	assert_eq(_layer.get_cell_atlas_coords(Vector2i(19, 5)), GRASS)
	assert_eq(_layer.get_cell_source_id(Vector2i(19, 5)), 0)
	assert_eq(_layer.get_cell_atlas_coords(Vector2i(3, 4)), DIRT)
	assert_true(_history.undo())
	assert_eq(_layer.get_used_cells().size(), 0)


func test_erases_cells_with_a_null_tile() -> void:
	await _set_cells({"path": "Ground", "rects": [{"from": [0, 0], "to": [1, 0], "atlas": [0, 0]}]})
	var result: Dictionary = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0], "atlas": null}]})
	assert_eq(result["erased"], 1)
	assert_eq(_layer.get_cell_source_id(Vector2i(0, 0)), -1)
	assert_eq(_layer.get_cell_source_id(Vector2i(1, 0)), 0)


func test_refuses_a_tile_that_the_source_does_not_have() -> void:
	var error: GodotMcpCommandError = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0], "atlas": [5, 5]}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(error.hint, "[1, 0]")
	assert_eq(_layer.get_used_cells().size(), 0)


func test_needs_the_source_when_the_tile_set_has_several() -> void:
	var second := TileSetAtlasSource.new()
	second.texture = _tiles_texture()
	second.texture_region_size = Vector2i(TILE, TILE)
	second.create_tile(GRASS)
	_layer.tile_set.add_source(second)
	var error: GodotMcpCommandError = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0], "atlas": [0, 0]}]})
	var chosen: Dictionary = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0], "source": 1, "atlas": [0, 0]}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_eq(chosen["set"], 1)
	assert_eq(_layer.get_cell_source_id(Vector2i(0, 0)), 1)


func test_refuses_a_node_that_is_not_a_tile_map_layer() -> void:
	var error: GodotMcpCommandError = await _set_cells({"path": "Marker", "cells": [{"position": [0, 0], "atlas": [0, 0]}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_reads_the_cells_with_their_tiles_counts_bounds_and_the_tile_set() -> void:
	await _set_cells({"path": "Ground", "rects": [{"from": [0, 5], "to": [19, 5], "atlas": [0, 0]}], "cells": [{"position": [3, 4], "atlas": [1, 0]}]})
	var result: Dictionary = await _get_cells({"path": "Ground"})
	assert_eq(result["tile_size"], [TILE, TILE])
	assert_eq(result["physics_layers"], 0)
	assert_eq(result["sources"], [{"id": 0, "kind": "atlas", "texture": "", "columns": 3, "rows": 1, "tiles": 2, "collision_tiles": 0}])
	assert_eq(result["count"], 21)
	assert_eq(result["counts"], [{"source": 0, "atlas": [0, 0], "count": 20}, {"source": 0, "atlas": [1, 0], "count": 1}])
	assert_eq([result["from"], result["to"]], [[0, 4], [19, 5]])
	assert_eq((result["cells"] as Array)[0], {"position": [3, 4], "source": 0, "atlas": [1, 0], "alternative": 0})
	assert_false(result["more"])


func test_counts_the_scenes_of_a_scene_collection_source() -> void:
	var scenes := TileSetScenesCollectionSource.new()
	for scene_name in ["Coin", "Spike"]:
		var root := Node2D.new()
		root.name = scene_name
		var packed := PackedScene.new()
		packed.pack(root)
		root.free()
		scenes.create_scene_tile(packed)
	_layer.tile_set.add_source(scenes, 4)
	var result: Dictionary = await _get_cells({"path": "Ground"})
	assert_eq((result["sources"] as Array)[1], {"id": 4, "kind": "scenes", "tiles": 2})


func test_reads_a_rect_of_cells_and_says_when_more_follow() -> void:
	await _set_cells({"path": "Ground", "rects": [{"from": [0, 0], "to": [9, 0], "atlas": [0, 0]}]})
	var result: Dictionary = await _get_cells({"path": "Ground", "from": [2, 0], "to": [5, 0], "max_cells": 3})
	assert_eq(result["count"], 4)
	assert_eq((result["cells"] as Array).size(), 3)
	assert_true(result["more"])
