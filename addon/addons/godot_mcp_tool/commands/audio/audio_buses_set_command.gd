extends "../command.gd"

const GodotMcpAudioBusLayoutFile := preload("../../audio/audio_bus_layout_file.gd")
const GodotMcpAudioBuses := preload("../../audio/audio_buses.gd")
const GodotMcpSimilarNames := preload("../../util/similar_names.gd")

const SWITCH_SETTERS := {"mute": "set_bus_mute", "solo": "set_bus_solo", "bypass_effects": "set_bus_bypass_effects"}
const SETTING_NAMES := ["name", "volume_db", "send", "mute", "solo", "bypass_effects"]
const BUS_EXAMPLE := "Example: {\"buses\": [{\"name\": \"Music\", \"volume_db\": -6, \"send\": \"Master\"}]}"

var _layout_file: GodotMcpAudioBusLayoutFile


func _init(layout_file: GodotMcpAudioBusLayoutFile) -> void:
	_layout_file = layout_file


func execute(params: Dictionary) -> Variant:
	var settings: Variant = params.get("buses", [])
	var removals: Variant = params.get("remove", [])
	if not settings is Array or not removals is Array:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"buses\" and \"remove\" must be lists", BUS_EXAMPLE)
	if (settings as Array).is_empty() and (removals as Array).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "Give \"buses\" to add or change, or \"remove\"", BUS_EXAMPLE)
	var final_names: Variant = _names_after_removing(removals)
	if final_names is GodotMcpCommandError:
		return final_names
	for index in (settings as Array).size():
		var problem: Variant = _check_setting(settings[index], "buses[%d]" % index, removals)
		if problem is GodotMcpCommandError:
			return problem
		if not settings[index]["name"] in final_names:
			(final_names as Array).append(settings[index]["name"])
	for setting in settings:
		var problem: Variant = _check_send(setting, final_names)
		if problem is GodotMcpCommandError:
			return problem
	return _apply(settings, removals)


func _apply(settings: Array, removals: Array) -> Variant:
	var removed: Array = []
	for bus_name in removals:
		AudioServer.remove_bus(GodotMcpAudioBuses.index_of(bus_name))
		removed.append(bus_name)
	var added: Array = []
	var changed: Array = _resend_to_master_what_sent_to_removed_buses()
	for setting in settings:
		var bus_name: String = setting["name"]
		var index := GodotMcpAudioBuses.index_of(bus_name)
		if index < 0:
			AudioServer.add_bus()
			index = AudioServer.bus_count - 1
			AudioServer.set_bus_name(index, bus_name)
			AudioServer.set_bus_send(index, GodotMcpAudioBuses.master_name())
			added.append(bus_name)
		var before := GodotMcpAudioBuses.describe(index)
		_assign(index, setting)
		if not bus_name in added and GodotMcpAudioBuses.describe(index) != before and not bus_name in changed:
			changed.append(bus_name)
	var save_error := _layout_file.save_current()
	AudioServer.emit_signal(&"bus_layout_changed")
	if save_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "The buses changed but %s could not be saved: %s" % [_layout_file.path(), error_string(save_error)])
	return {"layout": _layout_file.path(), "added": added, "changed": changed, "removed": removed, "buses": GodotMcpAudioBuses.describe_all()}


static func _assign(index: int, setting: Dictionary) -> void:
	if setting.has("volume_db"):
		AudioServer.set_bus_volume_db(index, float(setting["volume_db"]))
	if setting.has("send") and index != GodotMcpAudioBuses.MASTER_INDEX:
		AudioServer.set_bus_send(index, setting["send"])
	for switch in SWITCH_SETTERS:
		if setting.has(switch):
			AudioServer.call(SWITCH_SETTERS[switch], index, setting[switch])


static func _resend_to_master_what_sent_to_removed_buses() -> Array:
	var resent: Array = []
	var bus_names := GodotMcpAudioBuses.names()
	for index in range(1, AudioServer.bus_count):
		if not str(AudioServer.get_bus_send(index)) in bus_names:
			AudioServer.set_bus_send(index, GodotMcpAudioBuses.master_name())
			resent.append(bus_names[index])
	return resent


static func _names_after_removing(removals: Array) -> Variant:
	var existing := GodotMcpAudioBuses.names()
	var remaining: Array = existing.duplicate()
	for removal in removals:
		var bus_name := str(removal)
		if bus_name == GodotMcpAudioBuses.master_name():
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s cannot be removed: every other bus ends in it" % bus_name)
		if not bus_name in existing:
			var similar := GodotMcpSimilarNames.hint(bus_name, existing)
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "There is no bus \"%s\" to remove%s" % [bus_name, "" if similar.is_empty() else ". " + similar], "The buses: %s." % ", ".join(existing))
		remaining.erase(bus_name)
	return remaining


static func _check_setting(setting: Variant, label: String, removals: Array) -> Variant:
	if not setting is Dictionary or not (setting as Dictionary).get("name") is String or str(setting["name"]).strip_edges().is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s needs the name of the bus" % label, BUS_EXAMPLE)
	for key in setting:
		if not key in SETTING_NAMES:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s has an unknown setting \"%s\"" % [label, key], "Settings of a bus: %s." % ", ".join(SETTING_NAMES))
	if setting["name"] in removals:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s is both changed and removed" % setting["name"])
	var volume: Variant = setting.get("volume_db", 0.0)
	if not (volume is float or volume is int) or not is_finite(float(volume)):
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s.volume_db must be a number of decibels" % label, "0 is unchanged loudness, -6 about half as loud.")
	if setting.has("send") and not setting["send"] is String:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s.send must be the name of a bus" % label)
	for switch in SWITCH_SETTERS:
		if setting.has(switch) and not setting[switch] is bool:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s.%s must be true or false" % [label, switch])
	return null


static func _check_send(setting: Dictionary, final_names: Array) -> Variant:
	if not setting.has("send"):
		return null
	var bus_name: String = setting["name"]
	var send: String = setting["send"]
	if bus_name == GodotMcpAudioBuses.master_name():
		if send.is_empty():
			return null
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s plays to the speakers and cannot send to %s" % [bus_name, send], "Send the other buses to %s instead." % bus_name)
	var position := final_names.find(bus_name)
	var send_position := final_names.find(send)
	if send_position < 0:
		var similar := GodotMcpSimilarNames.hint(send, final_names)
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s cannot send to \"%s\": there is no such bus%s" % [bus_name, send, "" if similar.is_empty() else ". " + similar], "The buses: %s." % ", ".join(final_names))
	if send_position >= position:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "%s cannot send to %s, which comes after it" % [bus_name, send], "A bus sends only to a bus before it in the layout; list %s before %s, or send %s to %s." % [send, bus_name, send, bus_name])
	return null
