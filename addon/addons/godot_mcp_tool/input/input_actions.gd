extends RefCounted

const InputEventCodec := preload("input_event_codec.gd")

const SETTING_PREFIX := "input/"
const BUILT_IN_PREFIX := "ui_"
const DEFAULT_DEADZONE := 0.2


static func names() -> Array:
	var action_names: Array = []
	for property in ProjectSettings.get_property_list():
		var setting_name := str(property["name"])
		if setting_name.begins_with(SETTING_PREFIX):
			action_names.append(setting_name.trim_prefix(SETTING_PREFIX))
	return action_names


static func exists(action_name: String) -> bool:
	return ProjectSettings.has_setting(SETTING_PREFIX + action_name)


static func is_built_in_action(action_name: String) -> bool:
	return action_name.begins_with(BUILT_IN_PREFIX)


static func describe(action_name: String) -> Dictionary:
	var setting: Variant = ProjectSettings.get_setting(SETTING_PREFIX + action_name, {})
	var action: Dictionary = setting if setting is Dictionary else {}
	return {"name": action_name, "deadzone": action.get("deadzone", DEFAULT_DEADZONE), "events": described_events(action_name)}


static func described_events(action_name: String) -> Array:
	var setting: Variant = ProjectSettings.get_setting(SETTING_PREFIX + action_name, {})
	var events: Variant = (setting as Dictionary).get("events", []) if setting is Dictionary else []
	var described: Array = []
	for event in events if events is Array else []:
		if event is InputEvent:
			described.append(InputEventCodec.describe(event))
	return described


static func deadzone_of(action_name: String) -> float:
	var setting: Variant = ProjectSettings.get_setting(SETTING_PREFIX + action_name, {})
	return float((setting as Dictionary).get("deadzone", DEFAULT_DEADZONE)) if setting is Dictionary else DEFAULT_DEADZONE


static func write(action_name: String, deadzone: float, events: Array) -> void:
	ProjectSettings.set_setting(SETTING_PREFIX + action_name, {"deadzone": deadzone, "events": events})


static func remove(action_name: String) -> void:
	ProjectSettings.clear(SETTING_PREFIX + action_name)
