extends GutTest

const FakeSceneAccess := preload("res://tests/support/fake_scene_access.gd")
const FakeScriptEditorAccess := preload("res://tests/support/fake_script_editor_access.gd")
const GodotMcpCommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const GodotMcpEditingContext := preload("res://addons/godot_mcp_tool/scene/editing_context.gd")
const GodotMcpJsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const GodotMcpNodeAddCollisionCommand := preload("res://addons/godot_mcp_tool/commands/node/node_add_collision_command.gd")
const GodotMcpPlainUndoHistory := preload("res://addons/godot_mcp_tool/scene/plain_undo_history.gd")
const GodotMcpSceneBatchEditCommand := preload("res://addons/godot_mcp_tool/commands/scene/scene_batch_edit_command.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _scenes: FakeSceneAccess
var _history: GodotMcpPlainUndoHistory
var _context: GodotMcpEditingContext
var _root: Node3D
var _rock: MeshInstance3D


func before_each() -> void:
	_scenes = FakeSceneAccess.new()
	_root = Node3D.new()
	_root.name = "Arena"
	_root.scene_file_path = "res://arena.tscn"
	_scenes.edited_root = _root
	_history = GodotMcpPlainUndoHistory.new()
	_context = GodotMcpEditingContext.new(_scenes, _history, GodotMcpVariantCodec.new(), FakeScriptEditorAccess.new())
	_rock = _own(_root, MeshInstance3D.new(), "Rock") as MeshInstance3D
	var sphere := SphereMesh.new()
	sphere.radius = 1.0
	sphere.height = 2.0
	_rock.mesh = sphere
	_rock.position = Vector3(3, 1, 0)


func after_each() -> void:
	_history.dispose()
	_scenes.release()


func _own(parent: Node, node: Node, node_name: String) -> Node:
	node.name = node_name
	parent.add_child(node)
	node.owner = _root
	return node


func _add_collision(params: Dictionary) -> Variant:
	return await GodotMcpNodeAddCollisionCommand.new(_context).execute(params)


func test_gives_a_mesh_a_static_body_with_a_fitted_sphere() -> void:
	var result: Dictionary = await _add_collision({"path": "Rock", "shape": "sphere"})
	var body := _rock.get_node("StaticBody3D") as StaticBody3D
	var shape := body.get_node("CollisionShape3D") as CollisionShape3D
	assert_eq(body.owner, _root)
	assert_eq(shape.owner, _root)
	assert_true(shape.shape is SphereShape3D)
	assert_eq((shape.shape as SphereShape3D).radius, 1.0)
	assert_eq(result["shapes"], [{"path": "Rock/StaticBody3D/CollisionShape3D", "type": "SphereShape3D"}])
	assert_eq(result["collision_size"], "Vector3(2, 2, 2)")
	assert_eq(result["mesh_size"], "Vector3(1.998, 2, 1.998)")


func test_undoes_the_collision_in_one_step() -> void:
	await _add_collision({"path": "Rock", "shape": "trimesh"})
	assert_true(_history.undo())
	assert_eq(_rock.get_child_count(), 0)


func test_builds_convex_and_trimesh_shapes_from_the_mesh() -> void:
	await _add_collision({"path": "Rock", "shape": "convex"})
	await _add_collision({"path": "Rock", "shape": "trimesh"})
	var shapes := _rock.find_children("*", "CollisionShape3D", true, false)
	assert_eq(shapes.size(), 2)
	assert_true((shapes[0] as CollisionShape3D).shape is ConvexPolygonShape3D)
	assert_true((shapes[1] as CollisionShape3D).shape is ConcavePolygonShape3D)


func test_fits_a_box_around_a_mesh_that_is_not_a_box() -> void:
	await _add_collision({"path": "Rock", "shape": "box"})
	var body := _rock.get_node("StaticBody3D") as StaticBody3D
	var box := (body.get_node("CollisionShape3D") as CollisionShape3D).shape as BoxShape3D
	assert_almost_eq(box.size, Vector3(2, 2, 2), Vector3.ONE * 0.01)


func test_splits_a_mesh_into_several_convex_shapes() -> void:
	var result: Dictionary = await _add_collision({"path": "Rock", "shape": "multiple_convex"})
	assert_gt((result["shapes"] as Array).size(), 0)
	assert_true(((_rock.get_node("StaticBody3D").get_child(0) as CollisionShape3D).shape) is ConvexPolygonShape3D)


func test_adds_a_sibling_shape_for_a_mesh_inside_a_body() -> void:
	var player := _own(_root, CharacterBody3D.new(), "Player")
	var body_mesh := _own(player, MeshInstance3D.new(), "Body") as MeshInstance3D
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = 1.8
	body_mesh.mesh = capsule
	body_mesh.position = Vector3(0, 0.9, 0)
	var result: Dictionary = await _add_collision({"path": "Player/Body", "shape": "capsule", "placement": "sibling"})
	var shape := player.get_node("CollisionShape3D") as CollisionShape3D
	assert_eq(shape.position, Vector3(0, 0.9, 0))
	assert_almost_eq((shape.shape as CapsuleShape3D).radius, 0.4, 0.0001)
	assert_almost_eq((shape.shape as CapsuleShape3D).height, 1.8, 0.0001)
	assert_eq(result["shapes"][0]["path"], "Player/CollisionShape3D")


func test_works_in_a_batch() -> void:
	var result: Dictionary = await GodotMcpSceneBatchEditCommand.new(_context).execute({"operations": [{"op": "node_add_collision", "path": "Rock", "shape": "sphere"}]})
	assert_eq((result["results"] as Array)[0]["op"], "node_add_collision")
	assert_not_null(_rock.get_node_or_null("StaticBody3D"))


func test_refuses_a_node_without_a_mesh() -> void:
	_own(_root, Node3D.new(), "Empty")
	var error: Variant = await _add_collision({"path": "Empty", "shape": "convex"})
	assert_true(error is GodotMcpCommandError)
	assert_eq((error as GodotMcpCommandError).code, GodotMcpJsonRpc.INVALID_PARAMS)
