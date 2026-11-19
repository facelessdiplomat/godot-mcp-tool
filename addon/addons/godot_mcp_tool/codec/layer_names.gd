extends RefCounted

const KINDS_BY_HINT := {
	PROPERTY_HINT_LAYERS_2D_RENDER: "2d_render",
	PROPERTY_HINT_LAYERS_2D_PHYSICS: "2d_physics",
	PROPERTY_HINT_LAYERS_2D_NAVIGATION: "2d_navigation",
	PROPERTY_HINT_LAYERS_3D_RENDER: "3d_render",
	PROPERTY_HINT_LAYERS_3D_PHYSICS: "3d_physics",
	PROPERTY_HINT_LAYERS_3D_NAVIGATION: "3d_navigation",
	PROPERTY_HINT_LAYERS_AVOIDANCE: "avoidance",
}
const KIND_TITLES := {
	"2d_render": "2D render",
	"2d_physics": "2D physics",
	"2d_navigation": "2D navigation",
	"3d_render": "3D render",
	"3d_physics": "3D physics",
	"3d_navigation": "3D navigation",
	"avoidance": "avoidance",
}
const RENDER_LAYER_COUNT := 20
const LAYER_COUNT := 32
const SETTING_PREFIX := "layer_names/"


static func kind_of(hint: int) -> String:
	return KINDS_BY_HINT.get(hint, "")


static func title_of(kind: String) -> String:
	return KIND_TITLES.get(kind, kind)


static func layer_count(kind: String) -> int:
	return RENDER_LAYER_COUNT if kind.ends_with("_render") else LAYER_COUNT


static func name_of(kind: String, number: int) -> String:
	var setting := "%s%s/layer_%d" % [SETTING_PREFIX, kind, number]
	if not ProjectSettings.has_setting(setting):
		return ""
	return str(ProjectSettings.get_setting(setting)).strip_edges()


static func named_layers(kind: String) -> Array:
	var layers: Array = []
	for number in range(1, layer_count(kind) + 1):
		var layer_name := name_of(kind, number)
		if not layer_name.is_empty():
			layers.append({"number": number, "name": layer_name})
	return layers


static func named_layers_by_kind() -> Dictionary:
	var named := {}
	for kind: String in KIND_TITLES:
		var layers := named_layers(kind)
		if not layers.is_empty():
			named[kind] = layers
	return named


static func layers_in_mask(hint: int, mask: int) -> Array:
	var kind := kind_of(hint)
	var layers: Array = []
	for number in range(1, LAYER_COUNT + 1):
		if mask & (1 << (number - 1)):
			layers.append({"number": number, "name": name_of(kind, number) if number <= layer_count(kind) else ""})
	return layers


static func numbers_named(kind: String, layer_name: String) -> Array:
	var numbers: Array = []
	for layer: Dictionary in named_layers(kind):
		if (layer["name"] as String).nocasecmp_to(layer_name) == 0:
			numbers.append(layer["number"])
	return numbers


static func describe_layers(layers: Array) -> String:
	var described := PackedStringArray()
	for layer: Dictionary in layers:
		var layer_name: String = layer["name"]
		described.append(str(layer["number"]) if layer_name.is_empty() else "%d \"%s\"" % [layer["number"], layer_name])
	return ", ".join(described)
