extends GutTest

const GodotMcpLayerNames := preload("res://addons/godot_mcp_tool/codec/layer_names.gd")
const GodotMcpVariantCodec := preload("res://addons/godot_mcp_tool/codec/variant_codec.gd")

const NAMED_LAYERS := {
	"layer_names/3d_physics/layer_1": "world",
	"layer_names/3d_physics/layer_2": "player",
	"layer_names/3d_physics/layer_3": "enemies",
	"layer_names/2d_physics/layer_1": "ground",
	"layer_names/3d_render/layer_20": "minimap",
	"layer_names/avoidance/layer_4": "crowd",
}

var _codec := GodotMcpVariantCodec.new()
var _original_names := {}


func before_each() -> void:
	_original_names = {}
	for setting in NAMED_LAYERS:
		_original_names[setting] = ProjectSettings.get_setting(setting)
		ProjectSettings.set_setting(setting, NAMED_LAYERS[setting])


func after_each() -> void:
	for setting in _original_names:
		ProjectSettings.set_setting(setting, _original_names[setting])


func _layer_property(hint: int) -> Dictionary:
	return {"name": "collision_mask", "type": TYPE_INT, "hint": hint, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT, "class_name": &""}


func _decoded(value: Variant, hint: int) -> Variant:
	var outcome := _codec.decode(value, _layer_property(hint))
	assert_true(outcome.is_success, "expected success, got: %s" % outcome.error)
	return outcome.value


func _error(value: Variant, hint: int) -> String:
	var outcome := _codec.decode(value, _layer_property(hint))
	assert_false(outcome.is_success, "expected a failure for %s" % str(value))
	return outcome.error


func test_decodes_layers_by_their_names() -> void:
	assert_eq(_decoded(["world", "enemies"], PROPERTY_HINT_LAYERS_3D_PHYSICS), 5)


func test_decodes_names_next_to_numbers() -> void:
	assert_eq(_decoded(["world", "enemies", 5], PROPERTY_HINT_LAYERS_3D_PHYSICS), 21)


func test_ignores_the_case_of_a_name() -> void:
	assert_eq(_decoded(["Player"], PROPERTY_HINT_LAYERS_3D_PHYSICS), 2)


func test_takes_names_from_the_kind_of_layer_that_the_property_has() -> void:
	assert_eq(_decoded(["ground"], PROPERTY_HINT_LAYERS_2D_PHYSICS), 1)
	assert_eq(_decoded(["minimap"], PROPERTY_HINT_LAYERS_3D_RENDER), 1 << 19)
	assert_eq(_decoded(["crowd"], PROPERTY_HINT_LAYERS_AVOIDANCE), 8)


func test_rejects_a_name_of_another_kind_of_layer_and_lists_the_named_layers_of_this_kind() -> void:
	var error := _error(["ground"], PROPERTY_HINT_LAYERS_3D_PHYSICS)
	assert_eq(error, "no 3D physics layer is named \"ground\"; the named 3D physics layers are 1 \"world\", 2 \"player\", 3 \"enemies\"")


func test_says_how_to_name_a_layer_when_its_kind_has_no_names() -> void:
	var error := _error(["water"], PROPERTY_HINT_LAYERS_3D_NAVIGATION)
	assert_eq(error, "no 3D navigation layer is named \"water\", and none has a name yet; name one with project_settings_set, such as {\"layer_names/3d_navigation/layer_2\": \"water\"}, or give layer numbers")


func test_rejects_a_name_that_two_layers_share() -> void:
	var original: Variant = ProjectSettings.get_setting("layer_names/3d_physics/layer_7")
	ProjectSettings.set_setting("layer_names/3d_physics/layer_7", "World")
	var error := _error(["world"], PROPERTY_HINT_LAYERS_3D_PHYSICS)
	ProjectSettings.set_setting("layer_names/3d_physics/layer_7", original)
	assert_eq(error, "the 3D physics layers 1 and 7 are both named \"world\"; give the layer number instead")


func test_still_rejects_layer_numbers_out_of_range() -> void:
	assert_string_contains(_error([0], PROPERTY_HINT_LAYERS_3D_PHYSICS), "from 1 to 32")


func test_lists_the_layers_of_a_mask_with_their_names() -> void:
	assert_eq(GodotMcpLayerNames.layers_in_mask(PROPERTY_HINT_LAYERS_3D_PHYSICS, 21), [
		{"number": 1, "name": "world"},
		{"number": 3, "name": "enemies"},
		{"number": 5, "name": ""},
	])


func test_lists_the_named_layers_of_every_kind_that_has_any() -> void:
	var named := GodotMcpLayerNames.named_layers_by_kind()
	assert_eq(named["3d_physics"], [{"number": 1, "name": "world"}, {"number": 2, "name": "player"}, {"number": 3, "name": "enemies"}])
	assert_eq(named["3d_render"], [{"number": 20, "name": "minimap"}])
	assert_false(named.has("3d_navigation"))


func test_names_the_kind_of_layer_of_a_property_hint() -> void:
	assert_eq(GodotMcpLayerNames.kind_of(PROPERTY_HINT_LAYERS_3D_PHYSICS), "3d_physics")
	assert_eq(GodotMcpLayerNames.kind_of(PROPERTY_HINT_LAYERS_2D_RENDER), "2d_render")
	assert_eq(GodotMcpLayerNames.kind_of(PROPERTY_HINT_FLAGS), "")
