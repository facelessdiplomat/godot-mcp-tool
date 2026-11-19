extends RefCounted

const THEME_ITEM_KINDS := {
	"colors": {"type": TYPE_COLOR, "hint": PROPERTY_HINT_NONE, "hint_string": ""},
	"constants": {"type": TYPE_INT, "hint": PROPERTY_HINT_NONE, "hint_string": ""},
	"fonts": {"type": TYPE_OBJECT, "hint": PROPERTY_HINT_RESOURCE_TYPE, "hint_string": "Font"},
	"font_sizes": {"type": TYPE_INT, "hint": PROPERTY_HINT_NONE, "hint_string": ""},
	"icons": {"type": TYPE_OBJECT, "hint": PROPERTY_HINT_RESOURCE_TYPE, "hint_string": "Texture2D"},
	"styles": {"type": TYPE_OBJECT, "hint": PROPERTY_HINT_RESOURCE_TYPE, "hint_string": "StyleBox"},
}
const POINT_COUNT_PROPERTY := "point_count"
const PROBE_POINT_COUNT := 3
const PROBE_MIDDLE_POINT := "point_1/"
const INDEXED_NAME_PATTERN := "^(?<prefix>item/|point_)(?<index>\\d+)/(?<field>[a-z_]+)$"
const COUNT_SUFFIX := "_count"


static func describe(object: Object, property_name: String, values: Dictionary) -> Variant:
	if object is Theme:
		return _theme_item(property_name)
	var parts := RegEx.create_from_string(INDEXED_NAME_PATTERN).search(property_name)
	if parts == null:
		return {}
	var prefix := parts.get_string("prefix")
	if prefix == "item/" and object is MeshLibrary:
		return _template_of(_mesh_library_probe(), property_name, "item/0/" + parts.get_string("field"))
	if prefix == "point_" and (object is Curve3D or object is Curve2D or object is Curve):
		var index := parts.get_string("index").to_int()
		var count := int(values.get(POINT_COUNT_PROPERTY, object.get(POINT_COUNT_PROPERTY)))
		if index >= count:
			return "%s has %d points, so it has no %s; set point_count first, such as {\"point_count\": %d, \"%s\": …}" % [object.get_class(), count, property_name, index + 1, property_name]
		return _template_of(_curve_probe(object), property_name, PROBE_MIDDLE_POINT + parts.get_string("field"))
	return {}


static func counts_first(names: Array) -> Array:
	var counts := names.filter(func(property_name: String) -> bool: return property_name.ends_with(COUNT_SUFFIX))
	var others := names.filter(func(property_name: String) -> bool: return not property_name.ends_with(COUNT_SUFFIX))
	return counts + others


static func _theme_item(property_name: String) -> Variant:
	var parts := property_name.split("/")
	if parts.size() != 3 or parts.has(""):
		return {}
	if not THEME_ITEM_KINDS.has(parts[1]):
		return "a theme item is named \"Type/kind/name\", such as \"Button/styles/normal\", with the kind one of %s" % ", ".join(PackedStringArray(THEME_ITEM_KINDS.keys()))
	var property: Dictionary = (THEME_ITEM_KINDS[parts[1]] as Dictionary).duplicate()
	property["name"] = property_name
	property["usage"] = PROPERTY_USAGE_DEFAULT
	property["class_name"] = &""
	return property


static func _template_of(probe: Object, property_name: String, template_name: String) -> Variant:
	for property in probe.get_property_list():
		if property["name"] == template_name:
			var template: Dictionary = (property as Dictionary).duplicate()
			template["name"] = property_name
			return template
	return {}


static func _mesh_library_probe() -> MeshLibrary:
	var probe := MeshLibrary.new()
	probe.create_item(0)
	return probe


static func _curve_probe(object: Object) -> Resource:
	var probe: Resource = ClassDB.instantiate(object.get_class())
	probe.set(POINT_COUNT_PROPERTY, PROBE_POINT_COUNT)
	return probe
