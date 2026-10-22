extends GutTest

const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const ORANGE_MATERIAL_PATH := "res://tests/fixtures/orange_material.tres"

var _codec := VariantCodec.new()


func test_passes_json_values_through() -> void:
	assert_eq(_codec.encode(true), true)
	assert_eq(_codec.encode(3), 3)
	assert_eq(_codec.encode(2.5), 2.5)
	assert_eq(_codec.encode("text"), "text")
	assert_null(_codec.encode(null))


func test_turns_string_names_and_node_paths_into_text() -> void:
	assert_eq(_codec.encode(&"walk"), "walk")
	assert_eq(_codec.encode(NodePath("Player/Mesh")), "Player/Mesh")


func test_writes_math_types_in_godot_syntax() -> void:
	assert_eq(_codec.encode(Vector3(1, 2, 3)), "Vector3(1, 2, 3)")
	assert_eq(_codec.encode(Color(1, 0, 0)), "Color(1, 0, 0, 1)")


func test_writes_a_saved_resource_as_its_path() -> void:
	assert_eq(_codec.encode(load(ORANGE_MATERIAL_PATH)), ORANGE_MATERIAL_PATH)


func test_writes_an_embedded_resource_as_its_class() -> void:
	assert_eq(_codec.encode(BoxMesh.new()), "<BoxMesh>")


func test_writes_a_node_as_its_class_and_name() -> void:
	var player: Node3D = autofree(Node3D.new())
	player.name = "Player"
	assert_eq(_codec.encode(player), "<Node3D Player>")


func test_encodes_arrays_and_packed_arrays_element_by_element() -> void:
	assert_eq(_codec.encode([Vector2(1, 2), "text"]), ["Vector2(1, 2)", "text"])
	assert_eq(_codec.encode(PackedInt32Array([1, 2])), [1, 2])


func test_truncates_long_arrays() -> void:
	var numbers := PackedInt32Array()
	numbers.resize(150)
	var encoded: Array = _codec.encode(numbers)
	assert_eq(encoded.size(), VariantCodec.MAXIMUM_ENCODED_ITEMS + 1)
	assert_eq(encoded[-1], "… 50 more")


func test_writes_dictionary_keys_as_text() -> void:
	assert_eq_deep(_codec.encode({1: Vector2(1, 1), &"speed": 5}), {"1": "Vector2(1, 1)", "speed": 5})


func test_writes_single_precision_floats_without_conversion_noise() -> void:
	var material := PhysicsMaterial.new()
	material.friction = 0.05
	assert_eq(_codec.encode(material.friction), 0.05)
	assert_eq(_codec.encode(0.1 + 0.2), 0.1 + 0.2)


func test_writes_special_floats_as_text() -> void:
	assert_eq(_codec.encode(NAN), "nan")
	assert_eq(_codec.encode(INF), "inf")
	assert_eq(_codec.encode(-INF), "-inf")
