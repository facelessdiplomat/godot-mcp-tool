extends GutTest

const Bounds := preload("res://addons/godot_mcp_tool/capture/bounds.gd")

var _root: Node3D


func before_each() -> void:
	_root = Node3D.new()
	_root.name = "Arena"
	add_child_autofree(_root)


func _mesh_instance(size: Vector3, position: Vector3) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh_instance.mesh = box
	mesh_instance.position = position
	return mesh_instance


func test_measures_the_meshes_of_a_subtree_in_world_space() -> void:
	var crate := Node3D.new()
	crate.position = Vector3(10, 0, 0)
	_root.add_child(crate)
	crate.add_child(_mesh_instance(Vector3(2, 2, 2), Vector3(0, 1, 0)))
	crate.add_child(_mesh_instance(Vector3(1, 1, 1), Vector3(3, 0.5, 0)))
	var measured: Dictionary = Bounds.measure(crate)
	assert_eq(measured["aabb"], AABB(Vector3(9, 0, -1), Vector3(4.5, 2, 2)))
	assert_eq(measured["visual_count"], 2)
	assert_eq(measured["collision_count"], 0)


func test_measures_csg_shapes() -> void:
	var floor_box := CSGBox3D.new()
	floor_box.size = Vector3(20, 1, 20)
	floor_box.position = Vector3(0, -0.5, 0)
	_root.add_child(floor_box)
	var measured: Dictionary = Bounds.measure(floor_box)
	assert_eq(measured["aabb"], AABB(Vector3(-10, -1, -10), Vector3(20, 1, 20)))


func test_falls_back_to_collision_shapes_without_meshes() -> void:
	var body := CharacterBody3D.new()
	body.position = Vector3(0, 1, 0)
	_root.add_child(body)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1, 2, 1)
	shape.shape = box
	body.add_child(shape)
	var measured: Dictionary = Bounds.measure(body)
	assert_eq(measured["aabb"], AABB(Vector3(-0.5, 0, -0.5), Vector3(1, 2, 1)))
	assert_eq(measured["visual_count"], 0)
	assert_eq(measured["collision_count"], 1)


func test_measures_a_node_without_shapes_as_a_point() -> void:
	var marker := Marker3D.new()
	marker.position = Vector3(1, 2, 3)
	_root.add_child(marker)
	assert_eq(Bounds.measure(marker)["aabb"], AABB(Vector3(1, 2, 3), Vector3.ZERO))


func test_measures_nodes_that_are_not_in_a_tree() -> void:
	var loose := Node3D.new()
	loose.position = Vector3(5, 0, 0)
	loose.add_child(_mesh_instance(Vector3(2, 2, 2), Vector3.ZERO))
	var measured: Dictionary = Bounds.measure(loose)
	loose.free()
	assert_eq(measured["aabb"], AABB(Vector3(4, -1, -1), Vector3(2, 2, 2)))


func test_measures_the_3d_nodes_below_a_plain_node() -> void:
	var level := Node.new()
	_root.add_child(level)
	level.add_child(_mesh_instance(Vector3(2, 2, 2), Vector3(0, 1, 0)))
	assert_eq(Bounds.measure(level)["aabb"], AABB(Vector3(-1, 0, -1), Vector3(2, 2, 2)))


func test_measures_a_plain_node_without_3d_nodes_at_the_origin() -> void:
	var logic := Node.new()
	_root.add_child(logic)
	assert_eq(Bounds.measure(logic)["aabb"], AABB())


func test_places_nodes_below_a_plain_node_like_the_engine_out_of_the_tree() -> void:
	var loose := Node3D.new()
	loose.position = Vector3(5, 0, 0)
	var group := Node.new()
	loose.add_child(group)
	group.add_child(_mesh_instance(Vector3(2, 2, 2), Vector3.ZERO))
	var measured: Dictionary = Bounds.measure(group)
	loose.free()
	assert_eq(measured["aabb"], AABB(Vector3(-1, -1, -1), Vector3(2, 2, 2)))
