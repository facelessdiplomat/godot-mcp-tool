extends RefCounted

const GodotMcpChangeSet := preload("change_set.gd")
const GodotMcpDynamicProperties := preload("../codec/dynamic_properties.gd")
const GodotMcpEnumOptions := preload("../codec/enum_options.gd")
const GodotMcpLayerNames := preload("../codec/layer_names.gd")
const GodotMcpSimilarNames := preload("../util/similar_names.gd")
const GodotMcpUndoHistory := preload("undo_history.gd")
const GodotMcpValueComparison := preload("../codec/value_comparison.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const LAYOUT_USAGE := PROPERTY_USAGE_CATEGORY | PROPERTY_USAGE_GROUP | PROPERTY_USAGE_SUBGROUP
const SCRIPT_PROPERTY := "script"
const BINDING_PROPERTIES := ["owner", "scene_file_path", "resource_path"]
const ANCHORS_PRESET_PROPERTY := "anchors_preset"
const LAYOUT_MODE_PROPERTY := "layout_mode"
const POSITION_LAYOUT_MODE := 0
const ANCHORS_LAYOUT_MODE := 1
const PATH_SEPARATOR := ":"
const BUILT_IN_SEPARATOR := "::"
const PREFERRED_RESOURCE_CLASSES := ["StandardMaterial3D"]

var _codec: GodotMcpVariantCodec


func _init(codec: GodotMcpVariantCodec) -> void:
	_codec = codec


func editable_properties(object: Object) -> Dictionary:
	var properties := {}
	for property in object.get_property_list():
		var usage: int = property["usage"]
		if property["name"] in BINDING_PROPERTIES:
			continue
		if property["name"] == SCRIPT_PROPERTY or (usage & PROPERTY_USAGE_EDITOR and not usage & LAYOUT_USAGE):
			properties[property["name"]] = property
	return properties


func settable_properties(object: Object) -> Dictionary:
	var properties := editable_properties(object)
	var owner_class := object.get_class()
	var inspector_properties := _properties_registered_for_the_inspector(owner_class)
	for property in object.get_property_list():
		var property_name: String = property["name"]
		var usage := int(property["usage"])
		if properties.has(property_name) or property_name in BINDING_PROPERTIES or usage & LAYOUT_USAGE:
			continue
		if usage & PROPERTY_USAGE_INTERNAL and not inspector_properties.has(property_name):
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
		if (property_name as String).contains(PATH_SEPARATOR):
			entries.append(_describe_path(object, property_name))
			continue
		if not properties.has(property_name):
			entries.append({"name": property_name, "error": _unknown_property_message(object, property_name, properties)})
			continue
		var property: Dictionary = properties[property_name]
		var value: Variant = object.get(property_name)
		if requested_names.is_empty() and not include_defaults and _is_default(object, property, value):
			continue
		entries.append(_entry(property, value))
	return entries


func plan(object: Object, values: Dictionary, owning_file: String = "") -> Dictionary:
	var decoding := _decode_all(object, values, owning_file, settable_properties(object))
	var decoded: Dictionary = decoding["decoded"]
	var writes: Dictionary = decoding["writes"]
	var implied := _layout_implied_by(object, decoded)
	var changes := GodotMcpChangeSet.new()
	for property_name in implied:
		changes.add_do_property(object, property_name, implied[property_name])
	for property_name in decoded:
		var write: Dictionary = writes[property_name]
		var holder: Object = write["holder"]
		changes.add_do_property(holder, write["property"], write["value"])
		changes.add_undo_property(holder, write["property"], holder.get(write["property"]))
	for property_name in implied:
		changes.add_undo_property(object, property_name, object.get(property_name))
	return {"changes": changes, "decoded": decoded, "rejected": decoding["rejected"]}


func apply(object: Object, values: Dictionary, history: GodotMcpUndoHistory, action_name: String, context: Object) -> Dictionary:
	var planned := plan(object, values)
	var changes: GodotMcpChangeSet = planned["changes"]
	if not changes.is_empty():
		history.record(action_name, context, [changes])
	return report(object, planned["decoded"], planned["rejected"])


func assign(object: Object, values: Dictionary, owning_file: String = "") -> Dictionary:
	return _assign_decoded(object, _decode_all(object, values, owning_file, settable_properties(object)))


func assign_while_running(object: Object, values: Dictionary) -> Dictionary:
	var properties := settable_properties(object)
	for property in object.get_property_list():
		if int(property["usage"]) & PROPERTY_USAGE_SCRIPT_VARIABLE and not properties.has(property["name"]):
			properties[property["name"]] = property
	return _assign_decoded(object, _decode_all(object, values, "", properties))


func _assign_decoded(object: Object, decoding: Dictionary) -> Dictionary:
	var decoded: Dictionary = decoding["decoded"]
	var writes: Dictionary = decoding["writes"]
	var implied := _layout_implied_by(object, decoded)
	for property_name in implied:
		object.set(property_name, implied[property_name])
	for property_name in decoded:
		var write: Dictionary = writes[property_name]
		(write["holder"] as Object).set(write["property"], write["value"])
	return report(object, decoded, decoding["rejected"])


func report(object: Object, decoded: Dictionary, rejected: Array) -> Dictionary:
	var applied: Array = []
	var not_applied: Array = []
	for property_name in decoded:
		var actual: Variant = object.get_indexed(NodePath(property_name)) if (property_name as String).contains(PATH_SEPARATOR) else object.get(property_name)
		if GodotMcpValueComparison.matches(decoded[property_name], actual):
			applied.append(property_name)
		else:
			not_applied.append({"name": property_name, "expected": _codec.encode(decoded[property_name]), "actual": _codec.encode(actual)})
	return {"applied": applied, "rejected": rejected, "not_applied": not_applied}


func _decode_all(object: Object, values: Dictionary, owning_file: String, properties: Dictionary) -> Dictionary:
	var decoded := {}
	var writes := {}
	var pending := {}
	var rejected: Array = []
	for property_name in _ordered_names(values.keys()):
		if (property_name as String).contains(PATH_SEPARATOR):
			var path_write: Variant = _decode_path(object, property_name, values[property_name], owning_file, pending)
			if path_write is String:
				rejected.append({"name": property_name, "reason": path_write})
				continue
			decoded[property_name] = (path_write as Dictionary)["requested"]
			writes[property_name] = path_write
			continue
		var property: Variant = _property_to_set(object, property_name, properties, values)
		if property is String:
			rejected.append({"name": property_name, "reason": property})
			continue
		var outcome := _codec.decode(values[property_name], property, object)
		if not outcome.is_success:
			rejected.append({"name": property_name, "reason": outcome.error})
			continue
		decoded[property_name] = outcome.value
		writes[property_name] = {"holder": object, "property": property_name, "value": outcome.value}
		pending[_pending_key(object, property_name)] = outcome.value
		if property_name == SCRIPT_PROPERTY and outcome.value is Script:
			properties.merge(_exported_script_properties(outcome.value))
	return {"decoded": decoded, "writes": writes, "rejected": rejected}


func _describe_path(object: Object, path: String) -> Dictionary:
	var resolved: Variant = _resolve_path(object, path)
	if resolved is String:
		return {"name": path, "error": resolved}
	var holder: Object = resolved["holder"]
	var property_name: String = resolved["property"]
	var part: String = resolved["part"]
	var properties := readable_properties(holder)
	if not properties.has(property_name):
		return {"name": path, "error": _unknown_property_message(holder, property_name, properties)}
	if part.is_empty():
		var entry := _entry(properties[property_name], holder.get(property_name))
		entry["name"] = path
		return entry
	var value: Variant = holder.get_indexed(NodePath(property_name + PATH_SEPARATOR + part))
	if value == null:
		return {"name": path, "error": _missing_part_message(holder.get(property_name), part)}
	return {"name": path, "type": type_string(typeof(value)), "value": _codec.encode(value)}


func _decode_path(object: Object, path: String, value: Variant, owning_file: String, pending: Dictionary) -> Variant:
	var resolved: Variant = _resolve_path(object, path)
	if resolved is String:
		return resolved
	var sharing := _sharing_problem(path, resolved["resources"], owning_file)
	if not sharing.is_empty():
		return sharing
	var holder: Object = resolved["holder"]
	var property_name: String = resolved["property"]
	var part: String = resolved["part"]
	var properties := settable_properties(holder)
	var property: Variant = _property_to_set(holder, property_name, properties, {})
	if property is String:
		return property
	if part.is_empty():
		var outcome := _codec.decode(value, property, holder)
		if not outcome.is_success:
			return outcome.error
		pending[_pending_key(holder, property_name)] = outcome.value
		return {"holder": holder, "property": property_name, "value": outcome.value, "requested": outcome.value}
	var part_path := NodePath(property_name + PATH_SEPARATOR + part)
	var original: Variant = holder.get(property_name)
	var key := _pending_key(holder, property_name)
	holder.set(property_name, pending.get(key, original))
	var current: Variant = holder.get_indexed(part_path)
	if current == null:
		holder.set(property_name, original)
		return _missing_part_message(original, part)
	var part_property := {"name": path, "type": typeof(current), "hint": PROPERTY_HINT_NONE, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT}
	var outcome := _codec.decode(value, part_property, holder)
	if not outcome.is_success:
		holder.set(property_name, original)
		return outcome.error
	holder.set_indexed(part_path, outcome.value)
	var combined: Variant = holder.get(property_name)
	holder.set(property_name, original)
	pending[key] = combined
	return {"holder": holder, "property": property_name, "value": combined, "requested": outcome.value}


func _resolve_path(object: Object, path: String) -> Variant:
	var names := path.split(PATH_SEPARATOR)
	if names.has(""):
		return "\"%s\" is not a property path; write it like \"mesh:size\" or \"position:y\"" % path
	var holder := object
	var resources: Array = []
	for index in names.size() - 1:
		var name := names[index]
		var properties := readable_properties(holder)
		if not properties.has(name):
			return _unknown_property_message(holder, name, properties)
		var value: Variant = holder.get(name)
		if value is Resource:
			holder = value
			resources.append({"path": PATH_SEPARATOR.join(names.slice(0, index + 1)), "resource": value})
			continue
		if value == null and int(properties[name]["type"]) == TYPE_OBJECT:
			return _empty_resource_message(name, names[index + 1], properties[name])
		if value is Object:
			return "%s holds %s, whose properties cannot be reached by a path" % [name, (value as Object).get_class()]
		return {"holder": holder, "property": name, "part": PATH_SEPARATOR.join(names.slice(index + 1)), "resources": resources}
	return {"holder": holder, "property": names[-1], "part": "", "resources": resources}


static func _sharing_problem(path: String, resources: Array, owning_file: String) -> String:
	if owning_file.is_empty():
		return ""
	for reached: Dictionary in resources:
		var resource: Resource = reached["resource"]
		var file := resource.resource_path.get_slice(BUILT_IN_SEPARATOR, 0)
		if file.is_empty() or file == owning_file:
			continue
		var name: String = reached["path"]
		if resource.resource_path.contains(BUILT_IN_SEPARATOR):
			return "%s comes from %s and is shared by every instance of it, so changing it here would be saved by no scene; give this node its own with {\"%s\": {\"new\": …}} instead, or change it in that scene" % [name, file, name]
		return "%s is the resource file %s, which other nodes and scenes may use too; change it with resource_set_properties path: \"%s\", or give this node its own with {\"%s\": {\"new\": …}}" % [name, file, file, name]
	return ""


static func _empty_resource_message(name: String, next_name: String, property: Dictionary) -> String:
	return "%s is empty, so it has no %s yet; create it with its values at once, such as {\"%s\": {\"new\": \"%s\", \"%s\": …}}" % [name, next_name, name, _creatable_class_for(property), next_name]


static func _creatable_class_for(property: Dictionary) -> String:
	var hinted := str(property.get("hint_string", "Resource")).split(",", false)
	for class_name_text in hinted:
		if ClassDB.can_instantiate(class_name_text):
			return class_name_text
		var subclasses := Array(ClassDB.get_inheriters_from_class(class_name_text)).filter(func(subclass: String) -> bool: return ClassDB.can_instantiate(subclass))
		for preferred in PREFERRED_RESOURCE_CLASSES:
			if preferred in subclasses:
				return preferred
		if not subclasses.is_empty():
			subclasses.sort()
			return subclasses[0]
	return hinted[-1] if not hinted.is_empty() else "Resource"


static func _missing_part_message(value: Variant, part: String) -> String:
	return "%s has no part \"%s\"" % [type_string(typeof(value)), part]


static func _pending_key(holder: Object, property_name: String) -> String:
	return "%d/%s" % [holder.get_instance_id(), property_name]


func _entry(property: Dictionary, value: Variant) -> Dictionary:
	var entry := {"name": property["name"], "type": _type_name(property), "value": _codec.encode(value)}
	if property["type"] == TYPE_INT and property["hint"] == PROPERTY_HINT_ENUM:
		entry["options"] = GodotMcpEnumOptions.parse(str(property["hint_string"]))
	var layer_kind := GodotMcpLayerNames.kind_of(property["hint"])
	if property["type"] == TYPE_INT and not layer_kind.is_empty() and value is int:
		entry["layer_kind"] = layer_kind
		entry["layers"] = GodotMcpLayerNames.layers_in_mask(property["hint"], value)
	return entry


static func _layout_implied_by(object: Object, decoded: Dictionary) -> Dictionary:
	var positions_itself := object is Control and int(object.get(LAYOUT_MODE_PROPERTY)) == POSITION_LAYOUT_MODE
	if positions_itself and decoded.has(ANCHORS_PRESET_PROPERTY) and not decoded.has(LAYOUT_MODE_PROPERTY):
		return {LAYOUT_MODE_PROPERTY: ANCHORS_LAYOUT_MODE}
	return {}


static func _properties_registered_for_the_inspector(owner_class: String) -> Dictionary:
	var names := {}
	for property in ClassDB.class_get_property_list(owner_class):
		if int(property["usage"]) & PROPERTY_USAGE_EDITOR:
			names[property["name"]] = true
	return names


static func _ordered_names(names: Array) -> Array:
	var ordered: Array = []
	if SCRIPT_PROPERTY in names:
		ordered.append(SCRIPT_PROPERTY)
	for property_name in GodotMcpDynamicProperties.counts_first(names):
		if property_name != SCRIPT_PROPERTY:
			ordered.append(property_name)
	return ordered


static func _property_to_set(object: Object, property_name: String, properties: Dictionary, values: Dictionary) -> Variant:
	if properties.has(property_name):
		return properties[property_name]
	var dynamic: Variant = GodotMcpDynamicProperties.describe(object, property_name, values)
	if dynamic is String or not (dynamic as Dictionary).is_empty():
		return dynamic
	return _unknown_property_message(object, property_name, properties)


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
	return GodotMcpValueComparison.matches(default_value, value)


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
	var similar := GodotMcpSimilarNames.hint(property_name, properties.keys())
	return message if similar.is_empty() else "%s %s" % [message, similar]
