extends GutTest

const GlobalClasses := preload("res://addons/godot_mcp_tool/util/global_classes.gd")


func test_finds_the_script_of_a_class_name() -> void:
	assert_eq(GlobalClasses.script_of("PatrolPoint").resource_path, "res://tests/fixtures/patrol_point.gd")
	assert_null(GlobalClasses.script_of("NoSuchClass"))
	assert_true("EnemyStats" in GlobalClasses.names())


func test_creates_the_native_base_class_with_the_script_attached() -> void:
	var point: Object = GlobalClasses.instantiate(GlobalClasses.script_of("PatrolPoint"))
	assert_true(point is Marker3D)
	assert_eq(point.get("wait_seconds"), 1.0)
	point.free()
