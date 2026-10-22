extends "../command.gd"

const Params := preload("../params.gd")
const SimilarNames := preload("../../util/similar_names.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

const MAXIMUM_SETTINGS := 200

var _codec: VariantCodec


func _init(codec: VariantCodec) -> void:
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var names: Variant = Params.text_list(params, "names")
	var prefix: Variant = Params.text(params, "prefix")
	for value in [names, prefix]:
		if value is CommandError:
			return value
	if (names as Array).is_empty() and (prefix as String).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Pass \"names\" or \"prefix\"", "Example: {\"prefix\": \"display/window/\"} or {\"names\": [\"application/run/main_scene\"]}")
	var all_settings := setting_names()
	var selected: Array = []
	var unknown: Array = []
	for setting_name in names:
		if ProjectSettings.has_setting(setting_name):
			selected.append(setting_name)
		else:
			unknown.append({"name": setting_name, "reason": unknown_setting_message(setting_name, all_settings)})
	if not (prefix as String).is_empty():
		for setting_name in all_settings:
			if setting_name.begins_with(prefix) and not setting_name in selected:
				selected.append(setting_name)
	var truncated := selected.size() > MAXIMUM_SETTINGS
	var settings: Array = []
	for setting_name in selected.slice(0, MAXIMUM_SETTINGS):
		settings.append({"name": setting_name, "value": _codec.encode(ProjectSettings.get_setting(setting_name))})
	return {"settings": settings, "unknown": unknown, "truncated": truncated}


static func setting_names() -> Array:
	var names: Array = []
	for property in ProjectSettings.get_property_list():
		var setting_name := str(property["name"])
		if setting_name.contains("/"):
			names.append(setting_name)
	return names


static func unknown_setting_message(setting_name: String, all_settings: Array) -> String:
	var message := "There is no project setting \"%s\"." % setting_name
	var similar := SimilarNames.hint(setting_name, all_settings)
	return message if similar.is_empty() else "%s %s" % [message, similar]
