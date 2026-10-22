extends "../command.gd"

const Params := preload("../params.gd")
const ProjectSettingsGetCommand := preload("project_settings_get_command.gd")
const ValueComparison := preload("../../codec/value_comparison.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

var _codec: VariantCodec
var _save_settings: Callable


func _init(codec: VariantCodec, save_settings: Callable) -> void:
	_codec = codec
	_save_settings = save_settings


func execute(params: Dictionary) -> Variant:
	var values: Variant = Params.dictionary(params, "values")
	if values is CommandError:
		return values
	if (values as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"values\" needs at least one setting", "Example: {\"values\": {\"application/run/main_scene\": \"res://levels/arena.tscn\"}}")
	var properties_by_name := {}
	for property in ProjectSettings.get_property_list():
		properties_by_name[str(property["name"])] = property
	var all_settings := ProjectSettingsGetCommand.setting_names()
	var applied: Array = []
	var rejected: Array = []
	var not_applied: Array = []
	var previous := {}
	for setting_name in values:
		if not ProjectSettings.has_setting(setting_name) or not properties_by_name.has(setting_name):
			rejected.append({"name": setting_name, "reason": ProjectSettingsGetCommand.unknown_setting_message(setting_name, all_settings)})
			continue
		var outcome := _codec.decode(values[setting_name], properties_by_name[setting_name], null)
		if not outcome.is_success:
			rejected.append({"name": setting_name, "reason": outcome.error})
			continue
		previous[setting_name] = _codec.encode(ProjectSettings.get_setting(setting_name))
		ProjectSettings.set_setting(setting_name, outcome.value)
		if ValueComparison.matches(outcome.value, ProjectSettings.get_setting(setting_name)):
			applied.append(setting_name)
		else:
			not_applied.append({"name": setting_name, "expected": _codec.encode(outcome.value), "actual": _codec.encode(ProjectSettings.get_setting(setting_name))})
	if not previous.is_empty():
		var save_error: Error = _save_settings.call()
		if save_error != OK:
			return CommandError.new(JsonRpc.OPERATION_FAILED, "The settings changed but project.godot could not be saved: %s" % error_string(save_error))
	return {"applied": applied, "rejected": rejected, "not_applied": not_applied, "previous": previous}
