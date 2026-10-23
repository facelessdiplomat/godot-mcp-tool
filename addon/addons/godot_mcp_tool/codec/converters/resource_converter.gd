extends "converter.gd"

const ResourceFactory := preload("../../resources/resource_factory.gd")

const CLASS_KEY := "new"
const NESTED_PROPERTIES_KEY := "properties"


func handles(property: Dictionary) -> bool:
	return property.get("type") == TYPE_OBJECT and property.get("hint") == PROPERTY_HINT_RESOURCE_TYPE


func decode(value: Variant, property: Dictionary, _target: Object, decoder: ValueDecoder) -> DecodeOutcome:
	var allowed_types := str(property.get("hint_string", "Resource")).split(",", false)
	if value == null:
		return _success(null)
	if value is String:
		return _load_resource(value, allowed_types)
	if value is Dictionary and (value as Dictionary).has("new"):
		return _create_resource(value, allowed_types, decoder)
	return _failure("expected a resource path such as \"res://materials/stone.tres\", {\"new\": \"%s\", …properties}, or null" % allowed_types[-1])


func _load_resource(path: String, allowed_types: PackedStringArray) -> DecodeOutcome:
	if not (path.begins_with("res://") or path.begins_with("uid://")):
		return _failure("resource paths start with res:// or uid://, got \"%s\"" % path)
	if not ResourceLoader.exists(path):
		return _failure("resource %s not found" % path)
	var resource := load(path)
	if resource == null:
		return _failure("resource %s could not be loaded" % path)
	if not _is_allowed(resource, allowed_types):
		return _failure("%s is a %s, but this property needs %s" % [path, _display_class(resource), _describe(allowed_types)])
	return _success(resource)


func _create_resource(specification: Dictionary, allowed_types: PackedStringArray, decoder: ValueDecoder) -> DecodeOutcome:
	var type_name: Variant = specification["new"]
	if not type_name is String:
		return _failure("\"new\" must be the name of a resource class")
	var resource := ResourceFactory.instantiate(type_name)
	if resource == null:
		return _failure("%s is not a resource class that can be created" % type_name)
	if not _is_allowed(resource, allowed_types):
		return _failure("%s cannot be used here; this property needs %s" % [type_name, _describe(allowed_types)])
	var properties_by_name := {}
	for resource_property in resource.get_property_list():
		properties_by_name[resource_property["name"]] = resource_property
	var values := _values_of(specification, properties_by_name)
	for property_name in values:
		if not properties_by_name.has(property_name):
			var similar := _similar_names(property_name, properties_by_name.keys())
			var suggestion := "" if similar.is_empty() else " Similar: %s." % ", ".join(similar)
			return _failure("%s has no property \"%s\".%s" % [type_name, property_name, suggestion])
		var nested := decoder.decode(values[property_name], properties_by_name[property_name], resource)
		if not nested.is_success:
			return _failure("%s.%s: %s" % [type_name, property_name, nested.error])
		resource.set(property_name, nested.value)
	return _success(resource)


static func _values_of(specification: Dictionary, properties_by_name: Dictionary) -> Dictionary:
	var nested_values: Variant = specification.get(NESTED_PROPERTIES_KEY)
	var nests_its_values := nested_values is Dictionary and not properties_by_name.has(NESTED_PROPERTIES_KEY)
	var values := (nested_values as Dictionary).duplicate() if nests_its_values else {}
	for property_name in specification:
		if property_name != CLASS_KEY and not (nests_its_values and property_name == NESTED_PROPERTIES_KEY):
			values[property_name] = specification[property_name]
	return values


static func _is_allowed(resource: Object, allowed_types: PackedStringArray) -> bool:
	for allowed_type in allowed_types:
		if _is_instance_of(resource, allowed_type):
			return true
	return false


static func _describe(allowed_types: PackedStringArray) -> String:
	if allowed_types.size() > 3:
		return allowed_types[-1]
	return " or ".join(allowed_types)
