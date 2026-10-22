extends RefCounted

const ChangeSet := preload("change_set.gd")
const EnumOptions := preload("../codec/enum_options.gd")
const SimilarNames := preload("../util/similar_names.gd")
const UndoHistory := preload("undo_history.gd")
const ValueComparison := preload("../codec/value_comparison.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const LAYOUT_USAGE := PROPERTY_USAGE_CATEGORY | PROPERTY_USAGE_GROUP | PROPERTY_USAGE_SUBGROUP
const HIDDEN_USAGE := LAYOUT_USAGE | PROPERTY_USAGE_INTERNAL
const SCRIPT_PROPERTY := "script"
const BINDING_PROPERTIES := ["owner", "scene_file_path", "resource_path"]

var _codec: VariantCodec


func _init(codec: VariantCodec) -> void:
	_codec = codec


func editable_properties(object: Object) -> Dictionary:
	var properties := {}
	for property in object.get_property_list():
		var usage: int = property["usage"]
		if property["name"] in BINDING_PROPERTIES:
			continue
		if property["name"] == SCRIPT_PROPERTY or (usage & PROPERTY_USAGE_EDITOR and not usage & HIDDEN_USAGE):
			properties[property["name"]] = property
	return properties


func settable_properties(object: Object) -> Dictionary:
	var properties := editable_properties(object)
	var owner_class := object.get_class()
	for property in object.get_property_list():
		var property_name: String = property["name"]
		if properties.has(property_name) or property_name in BINDING_PROPERTIES or int(property["usage"]) & HIDDEN_USAGE:
			continue
		if not ClassDB.class_get_property_setter(owner_class, property_name).is_empty():
			properties[property_name] = property
	return properties


func readable_properties(object: Object) -> Dictionary:
	var properties := {}
	for property in object.get_property_list():
		if not int(property["usage"]) & LAYOUT_USAGE:
			properties[property["name"]] = property
	return properties


func describe(object: Object, requested_names: PackedStringArray, include_defaults: bool) -> Array:
	var properties := editable_properties(object) if requested_names.is_empty() else readable_properties(object)
	var names: Array = properties.keys() if requested_names.is_empty() else Array(requested_names)
	var entries: Array = []
	for property_name in names:
		if not properties.has(property_name):
			entries.append({"name": property_name, "error": _unknown_property_message(object, property_name, properties)})
			continue
		var property: Dictionary = properties[property_name]
		var value: Variant = object.get(property_name)
		if requested_names.is_empty() and not include_defaults and _is_default(object, property, value):
			continue
		entries.append(_entry(property, value))
	return entries


func plan(object: Object, values: Dictionary) -> Dictionary:
	var decoding := _decode_all(object, values)
	var decoded: Dictionary = decoding["decoded"]
	var changes := ChangeSet.new()
	for property_name in decoded:
		changes.add_do_property(object, property_name, decoded[property_name])
		changes.add_undo_property(object, property_name, object.get(property_name))
	return {"changes": changes, "decoded": decoded, "rejected": decoding["rejected"]}


func apply(object: Object, values: Dictionary, history: UndoHistory, action_name: String, context: Object) -> Dictionary:
	var planned := plan(object, values)
	var changes: ChangeSet = planned["changes"]
	if not changes.is_empty():
		history.record(action_name, context, [changes])
	return report(object, planned["decoded"], planned["rejected"])


func assign(object: Object, values: Dictionary) -> Dictionary:
	var decoding := _decode_all(object, values)
	var decoded: Dictionary = decoding["decoded"]
	for property_name in decoded:
		object.set(property_name, decoded[property_name])
	return report(object, decoded, decoding["rejected"])


func report(object: Object, decoded: Dictionary, rejected: Array) -> Dictionary:
	var applied: Array = []
	var not_applied: Array = []
	for property_name in decoded:
		var actual: Variant = object.get(property_name)
		if ValueComparison.matches(decoded[property_name], actual):
			applied.append(property_name)
		else:
			not_applied.append({"name": property_name, "expected": _codec.encode(decoded[property_name]), "actual": _codec.encode(actual)})
	return {"applied": applied, "rejected": rejected, "not_applied": not_applied}


func _decode_all(object: Object, values: Dictionary) -> Dictionary:
	var properties := settable_properties(object)
	var decoded := {}
	var rejected: Array = []
	for property_name in _ordered_names(values.keys()):
		if not properties.has(property_name):
			rejected.append({"name": property_name, "reason": _unknown_property_message(object, property_name, properties)})
			continue
		var outcome := _codec.decode(values[property_name], properties[property_name], object)
		if not outcome.is_success:
			rejected.append({"name": property_name, "reason": outcome.error})
			continue
		decoded[property_name] = outcome.value
		if property_name == SCRIPT_PROPERTY and outcome.value is Script:
			properties.merge(_exported_script_properties(outcome.value))
	return {"decoded": decoded, "rejected": rejected}


func _entry(property: Dictionary, value: Variant) -> Dictionary:
	var entry := {"name": property["name"], "type": _type_name(property), "value": _codec.encode(value)}
	if property["type"] == TYPE_INT and property["hint"] == PROPERTY_HINT_ENUM:
		entry["options"] = EnumOptions.parse(str(property["hint_string"]))
	return entry


static func _ordered_names(names: Array) -> Array:
	var ordered: Array = []
	if SCRIPT_PROPERTY in names:
		ordered.append(SCRIPT_PROPERTY)
	for property_name in names:
		if property_name != SCRIPT_PROPERTY:
			ordered.append(property_name)
	return ordered


static func _exported_script_properties(script: Script) -> Dictionary:
	var properties := {}
	for property in script.get_script_property_list():
		if property["usage"] & PROPERTY_USAGE_EDITOR:
			properties[property["name"]] = property
	return properties


static func _is_default(object: Object, property: Dictionary, value: Variant) -> bool:
	var default_value: Variant = null
	var script := object.get_script() as Script
	if property["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE and script != null:
		default_value = script.get_property_default_value(property["name"])
	else:
		default_value = ClassDB.class_get_property_default_value(object.get_class(), property["name"])
	return ValueComparison.matches(default_value, value)


static func _type_name(property: Dictionary) -> String:
	var type: int = property["type"]
	var hint: int = property["hint"]
	if type == TYPE_OBJECT:
		var hint_string := str(property["hint_string"])
		if hint == PROPERTY_HINT_RESOURCE_TYPE and not hint_string.is_empty():
			return hint_string.get_slice(",", hint_string.get_slice_count(",") - 1)
		var object_class := str(property["class_name"])
		return object_class if not object_class.is_empty() else "Object"
	if type == TYPE_INT and hint == PROPERTY_HINT_ENUM:
		return "enum"
	if type == TYPE_INT and hint == PROPERTY_HINT_FLAGS:
		return "flags"
	if type == TYPE_NIL:
		return "Variant"
	return type_string(type)


static func _unknown_property_message(object: Object, property_name: String, properties: Dictionary) -> String:
	var message := "%s has no property \"%s\"." % [object.get_class(), property_name]
	var similar := SimilarNames.hint(property_name, properties.keys())
	return message if similar.is_empty() else "%s %s" % [message, similar]
