extends RefCounted

const ResponsivenessPolicy := preload("responsiveness_policy.gd")

const FOCUSED_SLEEP_SETTINGS := [
	"interface/editor/timers/low_processor_mode_sleep_usec",
	"interface/editor/low_processor_mode_sleep_usec",
]
const UNFOCUSED_SLEEP_SETTINGS := [
	"interface/editor/timers/unfocused_low_processor_mode_sleep_usec",
	"interface/editor/unfocused_low_processor_mode_sleep_usec",
]
const DEFAULT_FOCUSED_SLEEP_USEC := 6900
const DEFAULT_UNFOCUSED_SLEEP_USEC := 100000


static func update(last_activity_msec: int) -> void:
	if DisplayServer.get_name() == "headless":
		return
	if EditorInterface.get_base_control().get_window().has_focus():
		return
	var settings := EditorInterface.get_editor_settings()
	var desired := ResponsivenessPolicy.desired_unfocused_sleep_usec(
		Time.get_ticks_msec(),
		last_activity_msec,
		_first_setting(settings, FOCUSED_SLEEP_SETTINGS, DEFAULT_FOCUSED_SLEEP_USEC),
		_first_setting(settings, UNFOCUSED_SLEEP_SETTINGS, DEFAULT_UNFOCUSED_SLEEP_USEC))
	if OS.low_processor_usage_mode_sleep_usec != desired:
		OS.low_processor_usage_mode_sleep_usec = desired


static func _first_setting(settings: EditorSettings, names: Array, default_value: int) -> int:
	for setting_name in names:
		if settings.has_setting(setting_name):
			return int(settings.get_setting(setting_name))
	return default_value
