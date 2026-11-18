extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpGridMapGetCellsCommand := preload("res://addons/godot_mcp_tool/commands/grid/gridmap_get_cells_command.gd")
const GodotMcpGridMapSetCellsCommand := preload("res://addons/godot_mcp_tool/commands/grid/gridmap_set_cells_command.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const FLOOR := 0
const WALL := 1

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D
var _grid: GridMap


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Courtyard"
	_root.scene_file_path = "res://courtyard.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	var library := MeshLibrary.new()
	for item in [FLOOR, WALL]:
		library.create_item(item)
		library.set_item_name(item, "Floor" if item == FLOOR else "Wall")
		library.set_item_mesh(item, BoxMesh.new())
	_grid = GridMap.new()
	_grid.name = "Ground"
	_grid.mesh_library = library
	_root.add_child(_grid)
	_grid.owner = _root
	var marker := Node3D.new()
	marker.name = "Marker"
	_root.add_child(marker)
	marker.owner = _root


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _set_cells(params: Dictionary) -> Variant:
	return await GodotMcpGridMapSetCellsCommand.new(_context).execute(params)


func _get_cells(params: Dictionary) -> Variant:
	return await GodotMcpGridMapGetCellsCommand.new(_context).execute(params)


func test_paints_boxes_and_cells_by_item_name_as_one_undo_step() -> void:
	var result: Dictionary = await _set_cells({
		"path": "Ground",
		"boxes": [{"from": [-1, 0, -1], "to": [1, 0, 1], "item": "Wall"}, {"from": [0, 0, 0], "to": [0, 0, 0], "item": "Floor"}],
		"cells": [{"position": [5, 0, 5], "item": WALL, "orientation": 10}],
	})
	assert_eq(_grid.get_cell_item(Vector3i(-1, 0, -1)), WALL)
	assert_eq(_grid.get_cell_item(Vector3i(0, 0, 0)), FLOOR)
	assert_eq(_grid.get_cell_item_orientation(Vector3i(5, 0, 5)), 10)
	assert_eq(result["set"], 10)
	assert_eq(result["erased"], 0)
	assert_true(_history.undo())
	assert_eq(_grid.get_used_cells().size(), 0)


func test_erases_cells_with_a_null_item() -> void:
	await _set_cells({"path": "Ground", "boxes": [{"from": [0, 0, 0], "to": [1, 0, 0], "item": "Floor"}]})
	var result: Dictionary = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0, 0], "item": null}]})
	assert_eq(result["erased"], 1)
	assert_eq(_grid.get_cell_item(Vector3i(0, 0, 0)), GridMap.INVALID_CELL_ITEM)
	assert_eq(_grid.get_cell_item(Vector3i(1, 0, 0)), FLOOR)


func test_explains_an_unknown_item_with_similar_names_and_changes_nothing() -> void:
	var error: GodotMcpCommandError = await _set_cells({"path": "Ground", "cells": [{"position": [0, 0, 0], "item": "Flor"}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message + " " + error.hint, "Floor")
	assert_eq(_grid.get_used_cells().size(), 0)


func test_refuses_a_node_that_is_not_a_grid_map() -> void:
	var error: GodotMcpCommandError = await _set_cells({"path": "Marker", "cells": [{"position": [0, 0, 0], "item": "Floor"}]})
	assert_eq(error.code, GodotMcpJsonRpc.INVALID_PARAMS)


func test_reads_the_cells_with_their_items_counts_and_bounds() -> void:
	await _set_cells({"path": "Ground", "boxes": [{"from": [-1, 0, -1], "to": [1, 0, 1], "item": "Wall"}, {"from": [0, 0, 0], "to": [0, 0, 0], "item": "Floor"}]})
	var result: Dictionary = await _get_cells({"path": "Ground"})
	assert_eq(result["items"], [{"id": FLOOR, "name": "Floor"}, {"id": WALL, "name": "Wall"}])
	assert_eq(result["count"], 9)
	assert_eq(result["counts"], [{"item": FLOOR, "name": "Floor", "count": 1}, {"item": WALL, "name": "Wall", "count": 8}])
	assert_eq(result["from"], [-1, 0, -1])
	assert_eq(result["to"], [1, 0, 1])
	assert_eq((result["cells"] as Array)[0], {"position": [-1, 0, -1], "item": WALL, "name": "Wall", "orientation": 0})
	assert_false(result["more"])


func test_reads_only_the_cells_inside_a_box_and_says_when_more_follow() -> void:
	await _set_cells({"path": "Ground", "boxes": [{"from": [0, 0, 0], "to": [4, 0, 0], "item": "Floor"}]})
	var result: Dictionary = await _get_cells({"path": "Ground", "from": [1, 0, 0], "to": [3, 0, 0], "max_cells": 2})
	assert_eq(result["count"], 3)
	assert_eq((result["cells"] as Array).size(), 2)
	assert_true(result["more"])
