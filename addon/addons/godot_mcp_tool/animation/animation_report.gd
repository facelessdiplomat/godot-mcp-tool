extends RefCounted

const GodotMcpAnimationVocabulary := preload("animation_vocabulary.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const MAXIMUM_KEYS_SHOWN := 20
const DECIMAL_SCALE := 1000.0


static func list(player: AnimationPlayer) -> Array:
	var animations: Array = []
	for name in player.get_animation_list():
		var animation := player.get_animation(name)
		animations.append({"name": str(name), "length": _rounded(animation.length), "loop": loop_name(animation), "tracks": animation.get_track_count()})
	return animations


static func detail(animation: Animation, name: String, codec: GodotMcpVariantCodec) -> Dictionary:
	var tracks: Array = []
	for index in animation.get_track_count():
		tracks.append(_track(animation, index, codec))
	return {"name": name, "length": _rounded(animation.length), "loop": loop_name(animation), "tracks": tracks}


static func loop_name(animation: Animation) -> String:
	return GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.LOOP_MODES, animation.loop_mode)


static func _track(animation: Animation, index: int, codec: GodotMcpVariantCodec) -> Dictionary:
	var type := animation.track_get_type(index)
	var track := {
		"path": str(animation.track_get_path(index)),
		"type": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.TRACK_TYPES, type),
		"interpolation": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.INTERPOLATIONS, animation.track_get_interpolation_type(index)),
	}
	if type == Animation.TYPE_VALUE:
		track["update"] = GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.UPDATE_MODES, animation.value_track_get_update_mode(index))
	var key_count := animation.track_get_key_count(index)
	var keys: Array = []
	for key_index in mini(key_count, MAXIMUM_KEYS_SHOWN):
		keys.append({"time": _rounded(animation.track_get_key_time(index, key_index)), "value": codec.encode(animation.track_get_key_value(index, key_index))})
	track["key_count"] = key_count
	track["keys"] = keys
	return track


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE
