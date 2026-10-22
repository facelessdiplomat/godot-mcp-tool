extends GutTest

const ImportedSceneReport := preload("res://addons/godot_mcp_tool/assets/imported_scene_report.gd")
const ScratchFolder := preload("res://tests/support/scratch_folder.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const CHARACTER := "res://tests/fixtures/models/character.glb"

var _scratch_directory := ""


func before_each() -> void:
	_scratch_directory = "res://.godot/mcp_test_scratch/%d" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(_scratch_directory))


func after_each() -> void:
	ScratchFolder.remove(ProjectSettings.globalize_path(_scratch_directory))


func _saved_scene_with_capsule_collision() -> String:
	var root := Node3D.new()
	var body := StaticBody3D.new()
	body.name = "StaticBody3D"
	var shape := CollisionShape3D.new()
	shape.name = "CollisionShape3D"
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.25
	capsule.height = 1.8
	shape.shape = capsule
	shape.position = Vector3(0, 0.9, 0)
	root.add_child(body)
	body.owner = root
	body.add_child(shape)
	shape.owner = root
	var scene := PackedScene.new()
	scene.pack(root)
	root.free()
	var scene_path := _scratch_directory.path_join("collision.tscn")
	ResourceSaver.save(scene, scene_path)
	return scene_path


func test_measures_the_imported_scene_and_lists_its_nodes() -> void:
	var report: Dictionary = ImportedSceneReport.describe(CHARACTER, VariantCodec.new())
	assert_eq(report["size"], "Vector3(50, 180, 50)")
	assert_eq(report["position"], "Vector3(-25, 0, -25)")
	assert_eq(report["nodes"], [{"path": ".", "type": "Node3D"}, {"path": "Body", "type": "MeshInstance3D", "size": "Vector3(50, 180, 50)"}])
	assert_eq(report["collision_shapes"], [])


func test_describes_collision_shapes_with_their_dimensions() -> void:
	var report: Dictionary = ImportedSceneReport.describe(_saved_scene_with_capsule_collision(), VariantCodec.new())
	assert_eq(
		report["collision_shapes"],
		[{"path": "StaticBody3D/CollisionShape3D", "shape": "CapsuleShape3D", "dimensions": [{"name": "radius", "value": 0.25}, {"name": "height", "value": 1.8}], "position": "Vector3(0, 0.9, 0)"}],
	)
