extends GutTest

const CommandError := preload("res://addons/godot_mcp_tool/commands/command_error.gd")
const JsonRpc := preload("res://addons/godot_mcp_tool/bridge/json_rpc.gd")
const NodeFactory := preload("res://addons/godot_mcp_tool/scene/node_factory.gd")

var _factory := NodeFactory.new()


func _created(type_text: String) -> Node:
	var created: Variant = _factory.create(type_text)
	assert_true(created is Node, "expected a node for %s, got %s" % [type_text, str(created.message) if created is CommandError else str(created)])
	return autofree(created) if created is Node else null


func _error(type_text: String) -> CommandError:
	var created: Variant = _factory.create(type_text)
	assert_true(created is CommandError, "expected an error for %s" % type_text)
	if created is Node:
		(created as Node).free()
	return created as CommandError


func test_creates_an_engine_node_class() -> void:
	assert_true(_created("MeshInstance3D") is MeshInstance3D)


func test_creates_a_node_from_a_global_script_class() -> void:
	var patrol_point := _created("PatrolPoint")
	assert_true(patrol_point is Marker3D)
	assert_eq((patrol_point.get_script() as Script).get_global_name(), &"PatrolPoint")


func test_instances_a_scene_by_path() -> void:
	var crate := _created("res://tests/fixtures/crate.tscn")
	assert_eq(crate.scene_file_path, "res://tests/fixtures/crate.tscn")
	assert_not_null(crate.get_node_or_null("Mesh"))


func test_rejects_a_class_that_is_not_a_node() -> void:
	var error := _error("BoxMesh")
	assert_eq(error.code, JsonRpc.INVALID_PARAMS)
	assert_string_contains(error.message, "not a node")


func test_rejects_an_abstract_class() -> void:
	assert_string_contains(_error("CollisionObject3D").message, "cannot be created")


func test_suggests_similar_names_for_an_unknown_type() -> void:
	var error := _error("MeshInstance")
	assert_eq(error.code, JsonRpc.NOT_FOUND)
	assert_string_contains(error.hint, "MeshInstance3D")


func test_reports_a_missing_scene_file() -> void:
	assert_eq(_error("res://missing/scene.tscn").code, JsonRpc.NOT_FOUND)
