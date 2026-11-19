extends GutTest

const GodotMcpMeshLibraryImport := preload("res://addons/godot_mcp_tool/resources/mesh_library_import.gd")

var _blocks: Node3D


func before_each() -> void:
	_blocks = Node3D.new()
	_blocks.name = "Blocks"
	_blocks.add_child(_block("Grass", Vector3(0, 0, 0), Vector3(2, 0.5, 2), Color.GREEN))
	var row := Node3D.new()
	row.name = "Row"
	_blocks.add_child(row)
	var stone := _block("Stone", Vector3(3, 0, 0), Vector3(2, 2, 2), Color.GRAY)
	stone.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var region := NavigationRegion3D.new()
	region.navigation_mesh = NavigationMesh.new()
	region.position = Vector3(0, 1, 0)
	stone.add_child(region)
	row.add_child(stone)
	var empty := MeshInstance3D.new()
	empty.name = "Empty"
	_blocks.add_child(empty)
	autofree(_blocks)


func _block(block_name: String, position: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var block := MeshInstance3D.new()
	block.name = block_name
	block.mesh = mesh
	block.position = position
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	block.set_surface_override_material(0, material)
	var body := StaticBody3D.new()
	body.position = Vector3(0, 0.25, 0)
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	var off := CollisionShape3D.new()
	off.shape = SphereShape3D.new()
	off.disabled = true
	body.add_child(off)
	block.add_child(body)
	return block


func test_turns_each_mesh_instance_with_a_mesh_into_an_item_with_its_name() -> void:
	var planned := GodotMcpMeshLibraryImport.plan(_blocks, false)

	assert_eq((planned["items"] as Array).map(func(item: Dictionary) -> String: return item["name"]), ["Grass", "Stone"])
	assert_eq(planned["duplicates"], [])


func test_keeps_the_surface_material_and_leaves_the_scene_mesh_alone() -> void:
	var grass: Dictionary = GodotMcpMeshLibraryImport.plan(_blocks, false)["items"][0]
	var mesh := grass["mesh"] as Mesh

	assert_eq((mesh.surface_get_material(0) as StandardMaterial3D).albedo_color, Color.GREEN)
	assert_ne(mesh, (_blocks.get_node("Grass") as MeshInstance3D).mesh)


func test_takes_the_enabled_shapes_of_the_static_bodies_with_their_transforms() -> void:
	var grass: Dictionary = GodotMcpMeshLibraryImport.plan(_blocks, false)["items"][0]
	var shapes: Array = grass["shapes"]

	assert_eq(shapes.size(), 2)
	assert_true(shapes[0] is BoxShape3D)
	assert_eq(shapes[1], Transform3D(Basis.IDENTITY, Vector3(0, 0.25, 0)))


func test_ignores_the_transform_of_the_block_unless_asked_to_apply_it() -> void:
	var ignored: Dictionary = GodotMcpMeshLibraryImport.plan(_blocks, false)["items"][1]
	var applied: Dictionary = GodotMcpMeshLibraryImport.plan(_blocks, true)["items"][1]

	assert_eq(ignored["mesh_transform"], Transform3D.IDENTITY)
	assert_eq(applied["mesh_transform"], Transform3D(Basis.IDENTITY, Vector3(3, 0, 0)))
	assert_eq(applied["shapes"][1], Transform3D(Basis.IDENTITY, Vector3(3, 0.25, 0)))


func test_takes_the_navigation_mesh_and_the_shadow_setting() -> void:
	var stone: Dictionary = GodotMcpMeshLibraryImport.plan(_blocks, false)["items"][1]

	assert_true(stone["navigation_mesh"] is NavigationMesh)
	assert_eq(stone["navigation_transform"], Transform3D(Basis.IDENTITY, Vector3(0, 1, 0)))
	assert_eq(stone["cast_shadow"], GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)


func test_names_blocks_that_share_a_name() -> void:
	(_blocks.get_node("Row") as Node).add_child(_block("Grass", Vector3.ZERO, Vector3.ONE, Color.RED))

	assert_eq(GodotMcpMeshLibraryImport.plan(_blocks, false)["duplicates"], ["Grass"])


func test_fills_a_new_library_with_ids_in_scene_order() -> void:
	var library := MeshLibrary.new()

	var applied := GodotMcpMeshLibraryImport.apply(library, GodotMcpMeshLibraryImport.plan(_blocks, false)["items"])

	assert_eq(applied["items"], [
		{"id": 0, "name": "Grass", "mesh": "BoxMesh", "shapes": 1, "navigation": false, "added": true},
		{"id": 1, "name": "Stone", "mesh": "BoxMesh", "shapes": 1, "navigation": true, "added": true},
	])
	assert_eq(applied["left"], [])
	assert_eq(library.get_item_shapes(0).size(), 2)
	assert_true(library.get_item_navigation_mesh(1) is NavigationMesh)
	assert_eq(library.get_item_mesh_cast_shadow(1), RenderingServer.SHADOW_CASTING_SETTING_OFF)


func test_keeps_the_ids_of_an_existing_library_and_lists_the_items_the_scene_lacks() -> void:
	var library := MeshLibrary.new()
	for item in [[4, "Stone"], [7, "Lava"]]:
		library.create_item(item[0])
		library.set_item_name(item[0], item[1])

	var applied := GodotMcpMeshLibraryImport.apply(library, GodotMcpMeshLibraryImport.plan(_blocks, false)["items"])

	assert_eq((applied["items"] as Array).map(func(item: Dictionary) -> Array: return [item["id"], item["name"], item["added"]]), [[8, "Grass", true], [4, "Stone", false]])
	assert_eq(applied["left"], [{"id": 7, "name": "Lava"}])
	assert_true(library.get_item_mesh(4) is BoxMesh)
