extends GutTest

const GodotMcpValueComparison := preload("res://addons/godot_mcp_tool/codec/value_comparison.gd")


func test_compares_floats_approximately() -> void:
	assert_true(GodotMcpValueComparison.matches(0.1 + 0.2, 0.3))
	assert_false(GodotMcpValueComparison.matches(0.1, 0.2))


func test_compares_vectors_and_colors_approximately() -> void:
	assert_true(GodotMcpValueComparison.matches(Vector3(0.1 + 0.2, 1, 1), Vector3(0.3, 1, 1)))
	assert_true(GodotMcpValueComparison.matches(Color(0.1 + 0.2, 0, 0), Color(0.3, 0, 0)))
	assert_false(GodotMcpValueComparison.matches(Vector3.ONE, Vector3.ZERO))


func test_treats_different_types_as_different() -> void:
	assert_false(GodotMcpValueComparison.matches(1, "1"))


func test_treats_an_integer_and_an_equal_float_as_equal() -> void:
	assert_true(GodotMcpValueComparison.matches(2, 2.0))


func test_compares_resources_by_identity_or_saved_path() -> void:
	var mesh := BoxMesh.new()
	assert_true(GodotMcpValueComparison.matches(mesh, mesh))
	assert_false(GodotMcpValueComparison.matches(mesh, BoxMesh.new()))
	var material := load("res://tests/fixtures/orange_material.tres")
	assert_true(GodotMcpValueComparison.matches(material, load("res://tests/fixtures/orange_material.tres")))


func test_compares_arrays_element_by_element() -> void:
	assert_true(GodotMcpValueComparison.matches([1.0, Vector2(0.1 + 0.2, 0)], [1, Vector2(0.3, 0)]))
	assert_false(GodotMcpValueComparison.matches([1, 2], [1]))


func test_compares_dictionaries_by_keys_and_values() -> void:
	assert_true(GodotMcpValueComparison.matches({"a": 0.1 + 0.2}, {"a": 0.3}))
	assert_false(GodotMcpValueComparison.matches({"a": 1}, {"b": 1}))
