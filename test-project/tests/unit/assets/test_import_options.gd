extends GutTest

const ImportOptions := preload("res://addons/godot_mcp_tool/assets/import_options.gd")
const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

var _codec := VariantCodec.new()


func _decoded(property: Variant, value: Variant) -> Variant:
	var outcome := _codec.decode(value, property)
	return outcome.value if outcome.is_success else outcome.error


func test_types_an_option_after_its_current_value() -> void:
	assert_eq(_decoded(ImportOptions.option_property("nodes/root_scale", 1.0), 0.01), 0.01)
	assert_eq(_decoded(ImportOptions.option_property("nodes/root_type", ""), "CharacterBody3D"), "CharacterBody3D")
	assert_eq(_decoded(ImportOptions.option_property("meshes/generate_lods", true), false), false)


func test_cannot_type_an_option_without_a_value() -> void:
	assert_null(ImportOptions.option_property("nodes/root_script", null))


func test_accepts_the_names_of_enum_values() -> void:
	assert_eq(_decoded(ImportOptions.option_property("materials/extract", 0), "Extract Once"), 1)
	assert_eq(_decoded(ImportOptions.node_option_property("physics/shape_type"), "Capsule"), 6)
	assert_eq(_decoded(ImportOptions.node_option_property("physics/body_type"), "RigidBody3D"), 1)
	assert_eq(_decoded(ImportOptions.node_option_property("physics/shape_type"), 3), 3)


func test_decodes_node_options_of_every_kind() -> void:
	assert_eq(_decoded(ImportOptions.node_option_property("generate/physics"), true), true)
	assert_eq(_decoded(ImportOptions.node_option_property("primitive/position"), [0, 90, 0]), Vector3(0, 90, 0))
	assert_eq(_decoded(ImportOptions.node_option_property("primitive/height"), 180), 180.0)
	assert_eq(_decoded(ImportOptions.node_option_property("physics/layer"), [1, 3]), 5)


func test_knows_only_the_listed_node_options() -> void:
	assert_null(ImportOptions.node_option_property("physics/shape"))
	assert_has(ImportOptions.node_option_names(), "physics/shape_type")


func test_describes_enum_values_by_name() -> void:
	assert_eq(ImportOptions.describe_node_option("physics/shape_type", 6, _codec), "Capsule")
	assert_eq(ImportOptions.describe_node_option("primitive/position", Vector3(0, 90, 0), _codec), "Vector3(0, 90, 0)")
	assert_eq(ImportOptions.describe_option("materials/extract", 1, _codec), "Extract Once")
	assert_eq(ImportOptions.describe_option("nodes/root_scale", 0.01, _codec), 0.01)
