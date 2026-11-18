extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpGameScene := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_scene.gd")
const GodotMcpGameRaycastCommand := preload("res://addons/godot_mcp_tool/runtime/game_commands/game_raycast_command.gd")
const GodotMcpNodeSnapToFloorCommand := preload("res://addons/godot_mcp_tool/commands/node/node_snap_to_floor_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpSceneRaycastCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_raycast_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const RAMP_POSITION := Vector3(30, 1.5, 0)
const RAMP_SLOPE := 0.75
const RAMP_TOP := 3.0
const SURFACE_TOLERANCE := 0.002

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://arena.tscn"
	_scenes.edited_root = _root
	add_child(_root)
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	var floor_body := _own(_root, StaticBody3D.new(), "Floor") as StaticBody3D
	floor_body.position = Vector3(0, -0.5, 0)
	var floor_shape := _own(floor_body, CollisionShape3D.new(), "Shape") as CollisionShape3D
	var box := BoxShape3D.new()
	box.size = Vector3(20, 1, 20)
	floor_shape.shape = box
	var hill := _own(_root, MeshInstance3D.new(), "Hill") as MeshInstance3D
	var hill_mesh := BoxMesh.new()
	hill_mesh.size = Vector3(4, 2, 4)
	hill.mesh = hill_mesh
	hill.position = Vector3(6, 1, 0)
	_add_crate("Crate", Vector3(0, 5, 0))
	_add_crate("HighCrate", Vector3(6, 7, 0))
	await get_tree().physics_frame
	await get_tree().physics_frame


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _own(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _add_crate(crate_name: String, position: Vector3) -> Node3D:
	var crate := _own(_root, Node3D.new(), crate_name) as Node3D
	crate.position = position
	(_own(crate, MeshInstance3D.new(), "Mesh") as MeshInstance3D).mesh = BoxMesh.new()
	return crate


func _add_ramp() -> void:
	var ramp := _own(_root, MeshInstance3D.new(), "Ramp") as MeshInstance3D
	var prism := PrismMesh.new()
	prism.size = Vector3(8, RAMP_TOP, 6)
	ramp.mesh = prism
	ramp.position = RAMP_POSITION


func _ramp_height_at(x: float) -> float:
	return RAMP_TOP - RAMP_SLOPE * absf(x - RAMP_POSITION.x)


func _assert_lies_flat_on_the_ramp(crate: Node3D) -> void:
	for x in [-0.5, 0.5]:
		for z in [-0.5, 0.5]:
			var corner := crate.global_transform * Vector3(x, -0.5, z)
			assert_almost_eq(corner.y, _ramp_height_at(corner.x), SURFACE_TOLERANCE, "bottom corner at x = %.3f" % corner.x)


func _raycast(params: Dictionary) -> Variant:
	return await GodotMcpSceneRaycastCommand.new(_context, null).execute(params)


func test_hits_a_collision_shape_straight_down() -> void:
	var hit: Dictionary = await _raycast({"from": [-3, 10, 0]})
	assert_true(hit["hit"])
	assert_eq(hit["node"], "Floor")
	assert_eq(hit["by"], "collision")
	assert_eq(hit["position"], "Vector3(-3, 0, 0)")
	assert_eq(hit["normal"], "Vector3(0, 1, 0)")
	assert_eq(hit["distance"], 10.0)


func test_hits_a_mesh_without_collision() -> void:
	var hit: Dictionary = await _raycast({"from": [6, 10, 0], "exclude": ["HighCrate"]})
	assert_eq(hit["node"], "Hill")
	assert_eq(hit["by"], "mesh")
	assert_eq(hit["position"], "Vector3(6, 2, 0)")


func test_casts_between_two_points() -> void:
	var hit: Dictionary = await _raycast({"from": [-5, 1, 0], "to": [10, 1, 0]})
	assert_eq(hit["node"], "Hill")
	assert_eq(hit["position"], "Vector3(4, 1, 0)")
	assert_eq(hit["normal"], "Vector3(-1, 0, 0)")


func test_passes_through_excluded_nodes() -> void:
	var hit: Dictionary = await _raycast({"from": [-3, 10, 0], "exclude": ["Floor"]})
	assert_false(hit["hit"])


func test_requires_a_starting_point() -> void:
	var error: Variant = await _raycast({})
	assert_true(error is GodotMcpCommandError)


func test_snaps_nodes_to_the_floor_and_onto_meshes() -> void:
	var result: Dictionary = await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Crate", "HighCrate"]})
	var placed: Array = result["nodes"]
	assert_eq((_root.get_node("Crate") as Node3D).position, Vector3(0, 0.5, 0))
	assert_eq((_root.get_node("HighCrate") as Node3D).position, Vector3(6, 2.5, 0))
	assert_eq(placed[0]["on"], "Floor")
	assert_eq(placed[0]["rise"], -4.5)
	assert_eq(placed[1]["on"], "Hill")
	assert_eq(placed[1]["by"], "mesh")


func test_undoes_the_snap_in_one_step() -> void:
	await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Crate", "HighCrate"]})
	assert_true(_history.undo())
	assert_eq((_root.get_node("Crate") as Node3D).position, Vector3(0, 5, 0))
	assert_eq((_root.get_node("HighCrate") as Node3D).position, Vector3(6, 7, 0))


func test_says_when_nothing_is_below() -> void:
	_add_crate("Lost", Vector3(50, 5, 50))
	var result: Dictionary = await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Lost"]})
	assert_false(result["nodes"][0]["moved"])
	assert_string_contains(result["nodes"][0]["reason"], "nothing below")


func test_lays_a_tilted_crate_flat_on_a_slope() -> void:
	_add_ramp()
	var crate := _add_crate("Tilted", Vector3(31.5, 8, 0))
	crate.rotation.z = -atan(RAMP_SLOPE)
	await get_tree().physics_frame
	await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Tilted"]})
	assert_almost_eq(crate.position.y, 2.5, SURFACE_TOLERANCE)
	_assert_lies_flat_on_the_ramp(crate)


func test_rests_an_upright_crate_on_its_uphill_edge_instead_of_sinking_it() -> void:
	_add_ramp()
	var crate := _add_crate("Upright", Vector3(32, 8, 0))
	await get_tree().physics_frame
	await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Upright"]})
	assert_almost_eq(crate.position.y, 2.375, SURFACE_TOLERANCE)


func test_tilts_a_crate_to_the_slope_when_asked_to_align_it() -> void:
	_add_ramp()
	var crate := _add_crate("Aligned", Vector3(28.5, 8, 0))
	await get_tree().physics_frame
	var result: Dictionary = await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Aligned"], "align": true})
	var placed: Dictionary = result["nodes"][0]
	assert_almost_eq(crate.rotation_degrees.z, rad_to_deg(atan(RAMP_SLOPE)), 0.01)
	assert_almost_eq(crate.position.y, 2.5, SURFACE_TOLERANCE)
	_assert_lies_flat_on_the_ramp(crate)
	assert_almost_eq(float(placed["tilt"]), 36.87, 0.001)
	assert_eq(placed["rotation"], "Vector3(0, 0, 36.87)")
	assert_eq(placed["on"], "Ramp")


func test_keeps_a_crate_under_a_ceiling_on_the_floor() -> void:
	var ceiling := _own(_root, StaticBody3D.new(), "Ceiling") as StaticBody3D
	ceiling.position = Vector3(-6, 1.8, 0)
	var slab := BoxShape3D.new()
	slab.size = Vector3(4, 0.2, 4)
	(_own(ceiling, CollisionShape3D.new(), "Shape") as CollisionShape3D).shape = slab
	var crate := _add_crate("Indoor", Vector3(-6, 0.6, 0))
	await get_tree().physics_frame
	var result: Dictionary = await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Indoor"]})
	assert_eq(crate.position, Vector3(-6, 0.5, 0))
	assert_eq(result["nodes"][0]["on"], "Floor")


func test_keeps_the_rotation_when_not_asked_to_align() -> void:
	_add_ramp()
	var crate := _add_crate("Upright", Vector3(32, 8, 0))
	await get_tree().physics_frame
	var result: Dictionary = await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Upright"]})
	assert_eq(crate.rotation, Vector3.ZERO)
	assert_false(result["nodes"][0].has("tilt"))


func test_undoes_the_tilt_and_the_move_in_one_step() -> void:
	_add_ramp()
	var crate := _add_crate("Aligned", Vector3(28.5, 8, 0))
	await get_tree().physics_frame
	await GodotMcpNodeSnapToFloorCommand.new(_context).execute({"paths": ["Aligned"], "align": true})
	assert_true(_history.undo())
	assert_eq(crate.position, Vector3(28.5, 8, 0))
	assert_eq(crate.rotation, Vector3.ZERO)


func test_casts_in_the_running_game() -> void:
	var command := GodotMcpGameRaycastCommand.new(GodotMcpGameScene.new(func() -> Node: return _root), GodotMcpVariantCodec.new())
	var hit: Dictionary = await command.execute({"from": [-3, 10, 0]})
	assert_eq(hit["node"], "Floor")
