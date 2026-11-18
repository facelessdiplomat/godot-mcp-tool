extends RefCounted

const GodotMcpAnimationVocabulary := preload("animation_vocabulary.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const MAXIMUM_KEYS_SHOWN := 20
const DECIMAL_SCALE := 1000.0
const INTERPOLATED_TYPES := [Animation.TYPE_VALUE, Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D, Animation.TYPE_BLEND_SHAPE]


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


static func sound_name(stream: Resource) -> String:
	if stream == null:
		return "no sound"
	return stream.resource_path if not stream.resource_path.is_empty() else "a built-in %s" % stream.get_class()


static func call_text(method: StringName, arguments: Array, codec: GodotMcpVariantCodec) -> String:
	var texts := PackedStringArray()
	for argument in arguments:
		var encoded: Variant = codec.encode(argument)
		var is_text := argument is String or argument is StringName
		texts.append(encoded if encoded is String and not is_text else JSON.stringify(encoded))
	return "%s(%s)" % [method, ", ".join(texts)]


static func _track(animation: Animation, index: int, codec: GodotMcpVariantCodec) -> Dictionary:
	var type := animation.track_get_type(index)
	var track := {
		"path": str(animation.track_get_path(index)),
		"type": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.TRACK_TYPES, type),
	}
	if type in INTERPOLATED_TYPES:
		track["interpolation"] = GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.INTERPOLATIONS, animation.track_get_interpolation_type(index))
	if type == Animation.TYPE_VALUE:
		track["update"] = GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.UPDATE_MODES, animation.value_track_get_update_mode(index))
	var key_count := animation.track_get_key_count(index)
	var keys: Array = []
	for key_index in mini(key_count, MAXIMUM_KEYS_SHOWN):
		keys.append({"time": _rounded(animation.track_get_key_time(index, key_index)), "value": _key_value(animation, index, key_index, codec)})
	track["key_count"] = key_count
	track["keys"] = keys
	return track


static func _key_value(animation: Animation, index: int, key_index: int, codec: GodotMcpVariantCodec) -> Variant:
	match animation.track_get_type(index):
		Animation.TYPE_METHOD:
			return call_text(animation.method_track_get_name(index, key_index), animation.method_track_get_params(index, key_index), codec)
		Animation.TYPE_AUDIO:
			return sound_name(animation.audio_track_get_key_stream(index, key_index))
	return codec.encode(animation.track_get_key_value(index, key_index))


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE
