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


func test_casts_in_the_running_game() -> void:
	var command := GodotMcpGameRaycastCommand.new(GodotMcpGameScene.new(func() -> Node: return _root), GodotMcpVariantCodec.new())
	var hit: Dictionary = await command.execute({"from": [-3, 10, 0]})
	assert_eq(hit["node"], "Floor")
