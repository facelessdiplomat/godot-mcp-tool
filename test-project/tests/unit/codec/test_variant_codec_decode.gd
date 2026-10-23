extends GutTest

const VariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")
const ORANGE_MATERIAL_PATH := "res://tests/fixtures/orange_material.tres"
const MESH_TYPES := "BoxMesh,SphereMesh,PlaneMesh,Mesh"
const SHADOW_DISPLAY_NAMES := "Off,On,Double-Sided,Shadows Only"

var _codec := VariantCodec.new()


func _property(type: int, hint: int = PROPERTY_HINT_NONE, hint_string: String = "", property_name: String = "value") -> Dictionary:
	return {"name": property_name, "type": type, "hint": hint, "hint_string": hint_string, "usage": PROPERTY_USAGE_DEFAULT, "class_name": &""}


func _decoded(value: Variant, property: Dictionary, target: Object = null) -> Variant:
	var outcome := _codec.decode(value, property, target)
	assert_true(outcome.is_success, "expected success, got: %s" % outcome.error)
	return outcome.value


func _error(value: Variant, property: Dictionary, target: Object = null) -> String:
	var outcome := _codec.decode(value, property, target)
	assert_false(outcome.is_success, "expected a failure for %s" % str(value))
	return outcome.error


func test_decodes_a_boolean() -> void:
	assert_eq(_decoded(true, _property(TYPE_BOOL)), true)


func test_rejects_text_for_a_boolean() -> void:
	assert_string_contains(_error("yes", _property(TYPE_BOOL)), "boolean")


func test_decodes_a_whole_number_for_an_integer() -> void:
	var value: Variant = _decoded(5.0, _property(TYPE_INT))
	assert_eq(typeof(value), TYPE_INT)
	assert_eq(value, 5)


func test_rejects_a_fraction_for_an_integer() -> void:
	assert_string_contains(_error(5.5, _property(TYPE_INT)), "whole number")


func test_decodes_a_number_for_a_float() -> void:
	var value: Variant = _decoded(2, _property(TYPE_FLOAT))
	assert_eq(typeof(value), TYPE_FLOAT)
	assert_eq(value, 2.0)


func test_decodes_text_for_strings_and_string_names() -> void:
	assert_eq(_decoded("hero", _property(TYPE_STRING)), "hero")
	assert_eq(typeof(_decoded("hero", _property(TYPE_STRING_NAME))), TYPE_STRING_NAME)


func test_decodes_a_node_path() -> void:
	assert_eq(_decoded("Player/Mesh", _property(TYPE_NODE_PATH)), NodePath("Player/Mesh"))


func test_decodes_vector2_from_an_array_an_object_and_godot_syntax() -> void:
	assert_eq(_decoded([1, 2], _property(TYPE_VECTOR2)), Vector2(1, 2))
	assert_eq(_decoded({"x": 1, "y": 2}, _property(TYPE_VECTOR2)), Vector2(1, 2))
	assert_eq(_decoded("Vector2(1, 2)", _property(TYPE_VECTOR2)), Vector2(1, 2))


func test_rejects_a_vector_with_the_wrong_number_of_components() -> void:
	assert_string_contains(_error([1, 2], _property(TYPE_VECTOR3)), "3 numbers")


func test_decodes_integer_vectors_only_from_whole_numbers() -> void:
	assert_eq(_decoded([1, 2], _property(TYPE_VECTOR2I)), Vector2i(1, 2))
	assert_string_contains(_error([1.5, 2], _property(TYPE_VECTOR2I)), "whole numbers")


func test_decodes_vector3_and_quaternion() -> void:
	assert_eq(_decoded([1, 2, 3], _property(TYPE_VECTOR3)), Vector3(1, 2, 3))
	assert_eq(_decoded([0, 0, 0, 1], _property(TYPE_QUATERNION)), Quaternion(0, 0, 0, 1))


func test_decodes_colors_from_hex_names_arrays_and_objects() -> void:
	assert_true((_decoded("#ff8000", _property(TYPE_COLOR)) as Color).is_equal_approx(Color(1, 0.50196, 0)))
	assert_eq(_decoded("red", _property(TYPE_COLOR)), Color.RED)
	assert_eq(_decoded([1, 0, 0], _property(TYPE_COLOR)), Color(1, 0, 0, 1))
	assert_eq(_decoded({"r": 1, "g": 0, "b": 0, "a": 0.5}, _property(TYPE_COLOR)), Color(1, 0, 0, 0.5))


func test_rejects_an_unknown_color_name() -> void:
	assert_string_contains(_error("not-a-color", _property(TYPE_COLOR)), "color")


func test_decodes_a_transform_from_godot_syntax() -> void:
	var transform: Transform3D = _decoded("Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3)", _property(TYPE_TRANSFORM3D))
	assert_eq(transform.origin, Vector3(1, 2, 3))


func test_rejects_godot_syntax_of_another_type() -> void:
	assert_string_contains(_error("Vector2(1, 2)", _property(TYPE_VECTOR3)), "Vector3")


func test_rejects_godot_syntax_that_creates_an_object() -> void:
	assert_string_contains(_error("Object(Resource, \"resource_name\": \"x\")", _property(TYPE_TRANSFORM3D)), "Transform3D")


func test_decodes_an_enum_by_display_name() -> void:
	var property := _property(TYPE_INT, PROPERTY_HINT_ENUM, SHADOW_DISPLAY_NAMES, "cast_shadow")
	assert_eq(_decoded("Double-Sided", property), 2)
	assert_eq(_decoded("shadows only", property), 3)


func test_decodes_an_enum_by_constant_name() -> void:
	var mesh_instance: MeshInstance3D = autofree(MeshInstance3D.new())
	var property := _property(TYPE_INT, PROPERTY_HINT_ENUM, SHADOW_DISPLAY_NAMES, "cast_shadow")
	assert_eq(_decoded("SHADOW_CASTING_SETTING_SHADOWS_ONLY", property, mesh_instance), 3)
	assert_eq(_decoded("GeometryInstance3D.SHADOW_CASTING_SETTING_OFF", property, mesh_instance), 0)


func test_decodes_an_enum_with_explicit_values() -> void:
	assert_eq(_decoded("Large", _property(TYPE_INT, PROPERTY_HINT_ENUM, "Small,Large:5")), 5)


func test_accepts_a_number_for_an_enum() -> void:
	assert_eq(_decoded(1, _property(TYPE_INT, PROPERTY_HINT_ENUM, SHADOW_DISPLAY_NAMES)), 1)


func test_rejects_an_unknown_enum_name_and_lists_the_options() -> void:
	var error := _error("Sideways", _property(TYPE_INT, PROPERTY_HINT_ENUM, SHADOW_DISPLAY_NAMES))
	assert_string_contains(error, "Double-Sided")


func test_decodes_flags_from_names() -> void:
	assert_eq(_decoded(["Fire", "Earth"], _property(TYPE_INT, PROPERTY_HINT_FLAGS, "Fire,Water,Earth")), 5)


func test_decodes_render_layers_from_layer_numbers() -> void:
	assert_eq(_decoded([1, 3], _property(TYPE_INT, PROPERTY_HINT_LAYERS_3D_RENDER)), 5)


func test_decodes_a_resource_path() -> void:
	var material: Variant = _decoded(ORANGE_MATERIAL_PATH, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Material"))
	assert_true(material is StandardMaterial3D)


func test_rejects_a_resource_of_the_wrong_type() -> void:
	assert_string_contains(_error(ORANGE_MATERIAL_PATH, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, MESH_TYPES)), "Mesh")


func test_reports_a_missing_resource_file() -> void:
	assert_string_contains(_error("res://missing/nothing.tres", _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Material")), "not found")


func test_creates_an_embedded_resource() -> void:
	var mesh: Variant = _decoded({"new": "BoxMesh", "size": [2, 1, 2]}, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, MESH_TYPES))
	assert_true(mesh is BoxMesh)
	assert_eq((mesh as BoxMesh).size, Vector3(2, 1, 2))


func test_creates_nested_embedded_resources() -> void:
	var value := {"new": "BoxMesh", "material": {"new": "StandardMaterial3D", "albedo_color": "#c04020"}}
	var mesh: BoxMesh = _decoded(value, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, MESH_TYPES))
	assert_true(mesh.material is StandardMaterial3D)


func test_rejects_an_embedded_resource_of_the_wrong_type() -> void:
	assert_string_contains(_error({"new": "SphereShape3D"}, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, MESH_TYPES)), "Mesh")


func test_reports_unknown_properties_of_an_embedded_resource() -> void:
	var error := _error({"new": "BoxMesh", "radius": 3}, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, MESH_TYPES))
	assert_string_contains(error, "radius")


func test_accepts_null_for_an_object() -> void:
	assert_null(_decoded(null, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "Material")))


func test_creates_a_resource_with_its_properties_nested_under_properties() -> void:
	var style: Variant = _decoded({"new": "StyleBoxFlat", "properties": {"bg_color": "#ff0000", "corner_radius_top_left": 4}}, _property(TYPE_OBJECT, PROPERTY_HINT_RESOURCE_TYPE, "StyleBox"))
	assert_true(style is StyleBoxFlat)
	assert_eq((style as StyleBoxFlat).bg_color, Color(1, 0, 0))
	assert_eq((style as StyleBoxFlat).corner_radius_top_left, 4)


func test_resolves_a_node_reference_relative_to_the_target() -> void:
	var owner_node: Node3D = autofree(Node3D.new())
	var enemy := Node3D.new()
	enemy.name = "Enemy"
	owner_node.add_child(enemy)
	assert_eq(_decoded("Enemy", _property(TYPE_OBJECT, PROPERTY_HINT_NODE_TYPE, "Node3D"), owner_node), enemy)


func _scene_with_hud_and_player() -> Node3D:
	var arena: Node3D = autofree(Node3D.new())
	arena.name = "Arena"
	for node_name in ["Hud", "Player"]:
		var node := Node3D.new()
		node.name = node_name
		arena.add_child(node)
		node.owner = arena
	return arena


func test_resolves_a_node_reference_relative_to_the_scene_root() -> void:
	var arena := _scene_with_hud_and_player()
	var hud := arena.get_node("Hud")
	assert_eq(_decoded("Player", _property(TYPE_OBJECT, PROPERTY_HINT_NODE_TYPE, "Node3D"), hud), arena.get_node("Player"))


func test_prefers_a_node_relative_to_the_target_to_one_of_the_scene_root() -> void:
	var arena := _scene_with_hud_and_player()
	var hud := arena.get_node("Hud")
	var own_player := Node3D.new()
	own_player.name = "Player"
	hud.add_child(own_player)
	assert_eq(_decoded("Player", _property(TYPE_OBJECT, PROPERTY_HINT_NODE_TYPE, "Node3D"), hud), own_player)


func test_rejects_a_node_found_neither_from_the_target_nor_from_the_scene_root() -> void:
	var hud := _scene_with_hud_and_player().get_node("Hud")
	assert_eq(_error("Ghost", _property(TYPE_OBJECT, PROPERTY_HINT_NODE_TYPE, "Node3D"), hud), "node \"Ghost\" was found neither relative to Hud nor from the scene root Arena")


func test_rejects_a_node_reference_of_the_wrong_type() -> void:
	var owner_node: Node3D = autofree(Node3D.new())
	var label := Label.new()
	label.name = "Caption"
	owner_node.add_child(label)
	assert_string_contains(_error("Caption", _property(TYPE_OBJECT, PROPERTY_HINT_NODE_TYPE, "Node3D"), owner_node), "Node3D")


func test_decodes_a_typed_array_of_integers() -> void:
	var numbers: Array = _decoded([1, 2, 3], _property(TYPE_ARRAY, PROPERTY_HINT_TYPE_STRING, "2:"))
	assert_eq(numbers.get_typed_builtin(), TYPE_INT)
	assert_eq(numbers, [1, 2, 3])


func test_decodes_a_typed_array_of_resources() -> void:
	var meshes: Array = _decoded([{"new": "BoxMesh"}], _property(TYPE_ARRAY, PROPERTY_HINT_TYPE_STRING, "24/17:Mesh"))
	assert_eq(meshes.get_typed_class_name(), &"Mesh")
	assert_true(meshes[0] is BoxMesh)


func test_reports_the_index_of_a_bad_array_element() -> void:
	assert_string_contains(_error([1, "two"], _property(TYPE_ARRAY, PROPERTY_HINT_TYPE_STRING, "2:")), "[1]")


func test_decodes_a_packed_vector3_array() -> void:
	var points: PackedVector3Array = _decoded([[0, 0, 0], [1, 2, 3]], _property(TYPE_PACKED_VECTOR3_ARRAY))
	assert_eq(points, PackedVector3Array([Vector3.ZERO, Vector3(1, 2, 3)]))


func test_decodes_a_dictionary() -> void:
	assert_eq_deep(_decoded({"speed": 5}, _property(TYPE_DICTIONARY)), {"speed": 5})


func test_passes_untyped_values_through_with_whole_numbers_as_integers() -> void:
	var value: Variant = _decoded(3.0, _property(TYPE_NIL))
	assert_eq(typeof(value), TYPE_INT)
	assert_eq(_decoded("text", _property(TYPE_NIL)), "text")
