extends RefCounted

const AnimationVocabulary := preload("animation_vocabulary.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const MAXIMUM_KEYS_SHOWN := 20
const DECIMAL_SCALE := 1000.0


static func list(player: AnimationPlayer) -> Array:
	var animations: Array = []
	for name in player.get_animation_list():
		var animation := player.get_animation(name)
		animations.append({"name": str(name), "length": _rounded(animation.length), "loop": loop_name(animation), "tracks": animation.get_track_count()})
	return animations


static func detail(animation: Animation, name: String, codec: VariantCodec) -> Dictionary:
	var tracks: Array = []
	for index in animation.get_track_count():
		tracks.append(_track(animation, index, codec))
	return {"name": name, "length": _rounded(animation.length), "loop": loop_name(animation), "tracks": tracks}


static func loop_name(animation: Animation) -> String:
	return AnimationVocabulary.name_of(AnimationVocabulary.LOOP_MODES, animation.loop_mode)


static func _track(animation: Animation, index: int, codec: VariantCodec) -> Dictionary:
	var type := animation.track_get_type(index)
	var track := {
		"path": str(animation.track_get_path(index)),
		"type": AnimationVocabulary.name_of(AnimationVocabulary.TRACK_TYPES, type),
		"interpolation": AnimationVocabulary.name_of(AnimationVocabulary.INTERPOLATIONS, animation.track_get_interpolation_type(index)),
	}
	if type == Animation.TYPE_VALUE:
		track["update"] = AnimationVocabulary.name_of(AnimationVocabulary.UPDATE_MODES, animation.value_track_get_update_mode(index))
	var key_count := animation.track_get_key_count(index)
	var keys: Array = []
	for key_index in mini(key_count, MAXIMUM_KEYS_SHOWN):
		keys.append({"time": _rounded(animation.track_get_key_time(index, key_index)), "value": codec.encode(animation.track_get_key_value(index, key_index))})
	track["key_count"] = key_count
	track["keys"] = keys
	return track


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE
