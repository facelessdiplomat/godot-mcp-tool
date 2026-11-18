extends RefCounted

const MASTER_INDEX := 0


static func names() -> Array[String]:
	var bus_names: Array[String] = []
	for index in AudioServer.bus_count:
		bus_names.append(AudioServer.get_bus_name(index))
	return bus_names


static func index_of(bus_name: String) -> int:
	return names().find(bus_name)


static func master_name() -> String:
	return AudioServer.get_bus_name(MASTER_INDEX)


static func describe_all() -> Array:
	var buses: Array = []
	for index in AudioServer.bus_count:
		buses.append(describe(index))
	return buses


static func describe(index: int) -> Dictionary:
	var effects: Array = []
	for effect_index in AudioServer.get_bus_effect_count(index):
		effects.append({"type": AudioServer.get_bus_effect(index, effect_index).get_class(), "enabled": AudioServer.is_bus_effect_enabled(index, effect_index)})
	return {
		"name": AudioServer.get_bus_name(index),
		"volume_db": AudioServer.get_bus_volume_db(index),
		"send": "" if index == MASTER_INDEX else str(AudioServer.get_bus_send(index)),
		"mute": AudioServer.is_bus_mute(index),
		"solo": AudioServer.is_bus_solo(index),
		"bypass_effects": AudioServer.is_bus_bypassing_effects(index),
		"effects": effects,
	}
