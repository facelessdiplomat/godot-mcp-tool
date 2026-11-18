extends RefCounted

const GodotMcpAnimationReport := preload("animation_report.gd")
const GodotMcpAnimationVocabulary := preload("animation_vocabulary.gd")
const GodotMcpIndefiniteArticle := preload("../util/indefinite_article.gd")
const GodotMcpMethodArguments := preload("../scene/method_arguments.gd")
const GodotMcpNodeFactory := preload("../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../scene/node_locator.gd")
const GodotMcpSimilarNames := preload("../util/similar_names.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

const VALUE_TRACK := "value"
const METHOD_TRACK := "method"
const AUDIO_TRACK := "audio"
const TRACK_KINDS := [VALUE_TRACK, METHOD_TRACK, AUDIO_TRACK]
const AUDIO_PLAYER_CLASSES := ["AudioStreamPlayer", "AudioStreamPlayer2D", "AudioStreamPlayer3D"]
const AUDIO_OFFSETS := {"start_offset": "start", "end_offset": "end"}
const VALUE_KEY_EXAMPLE := "{\"time\": seconds from 0, \"value\": ...}"
const METHOD_KEY_EXAMPLE := "{\"time\": seconds from 0, \"method\": \"_on_footstep\", \"args\": [...]}"
const AUDIO_KEY_EXAMPLE := "{\"time\": seconds from 0, \"stream\": \"res://sounds/step.ogg\"}"
const STEPPED_TYPES := [TYPE_BOOL, TYPE_STRING, TYPE_STRING_NAME, TYPE_NODE_PATH, TYPE_OBJECT]
const DEFAULT_LENGTH := 1.0
const DECIMAL_SCALE := 1000.0
const RESET_LENGTH := 0.001

var _codec: GodotMcpVariantCodec
var _root: Node


func _init(codec: GodotMcpVariantCodec, root: Node) -> void:
	_codec = codec
	_root = root


func plan(track_descriptions: Array, requested_length: Variant) -> Dictionary:
	var planned: Array = []
	var rejected: Array = []
	var planned_identities: Array = []
	for index in track_descriptions.size():
		var description: Variant = track_descriptions[index]
		var path := str(description.get("path", "")) if description is Dictionary else ""
		var track: Variant = _plan_track(description)
		if track is String:
			rejected.append({"index": index, "path": path, "reason": track})
			continue
		var identity := "%s %s" % [track["type"], path]
		if identity in planned_identities:
			rejected.append({"index": index, "path": path, "reason": _repeated_track_reason(track["type"])})
			continue
		planned_identities.append(identity)
		track["index"] = index
		planned.append(track)
	var length: float = requested_length if requested_length != null else _last_key_time(planned)
	var within_length: Array = []
	for track in planned:
		var late_key := _first_key_after(track, length)
		if late_key >= 0.0:
			var reason := "the key at %s s is after the end of the animation at %s s; make the animation longer with length" % [_seconds(late_key), _seconds(length)]
			rejected.append({"index": track["index"], "path": track["path"], "reason": reason})
			continue
		within_length.append(track)
	rejected.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left["index"] < right["index"])
	var rejections := rejected.map(func(rejection: Dictionary) -> Dictionary: return {"path": rejection["path"], "reason": rejection["reason"]})
	return {"tracks": within_length, "rejected": rejections, "length": length}


func build(planned_tracks: Array, length: float, loop_mode: int) -> Animation:
	var animation := Animation.new()
	animation.length = length
	animation.loop_mode = loop_mode
	for track in planned_tracks:
		match track["type"]:
			METHOD_TRACK:
				_add_method_track(animation, track)
			AUDIO_TRACK:
				_add_audio_track(animation, track)
			_:
				_add_value_track(animation, track, track["keys"])
	return animation


func build_reset(previous: Animation, planned_tracks: Array) -> Animation:
	var reset := previous.duplicate() as Animation if previous != null else Animation.new()
	if previous == null:
		reset.length = RESET_LENGTH
	for track in planned_tracks:
		_add_value_track(reset, track, [{"time": 0.0, "value": current_value(track)}])
	return reset


func current_value(track: Dictionary) -> Variant:
	var path := str(track["path"])
	var node_part := path.get_slice(":", 0)
	return _root.get_node(NodePath(node_part)).get_indexed(NodePath(":" + path.substr(node_part.length() + 1)))


func describe(track: Dictionary) -> Dictionary:
	var keys: Array = track["keys"]
	match track["type"]:
		METHOD_TRACK:
			var calls := keys.map(func(key: Dictionary) -> Dictionary: return {"time": _rounded(key["time"]), "call": GodotMcpAnimationReport.call_text(key["value"]["method"], key["value"]["args"], _codec)})
			return {"type": METHOD_TRACK, "path": track["path"], "keys": keys.size(), "calls": calls}
		AUDIO_TRACK:
			var sounds := keys.map(func(key: Dictionary) -> Dictionary: return {"time": _rounded(key["time"]), "stream": GodotMcpAnimationReport.sound_name(key["stream"])})
			return {"type": AUDIO_TRACK, "path": track["path"], "keys": keys.size(), "sounds": sounds}
	return {
		"type": VALUE_TRACK,
		"path": track["path"],
		"keys": keys.size(),
		"interpolation": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.INTERPOLATIONS, track["interpolation"]),
		"update": GodotMcpAnimationVocabulary.name_of(GodotMcpAnimationVocabulary.UPDATE_MODES, track["update"]),
		"from": _codec.encode(keys.front()["value"]),
		"to": _codec.encode(keys.back()["value"]),
	}


static func is_value_track(track: Dictionary) -> bool:
	return track["type"] == VALUE_TRACK


func _plan_track(description: Variant) -> Variant:
	if not description is Dictionary:
		return "a track is an object such as {\"path\": \"Door:position\", \"keys\": [{\"time\": 0, \"value\": [0, 0, 0]}]}"
	var kind := str(description.get("type", VALUE_TRACK))
	match kind:
		VALUE_TRACK:
			return _plan_value_track(description)
		METHOD_TRACK:
			return _plan_method_track(description)
		AUDIO_TRACK:
			return _plan_audio_track(description)
	return "unknown track type \"%s\"; use one of: %s" % [kind, ", ".join(PackedStringArray(TRACK_KINDS))]


func _plan_value_track(description: Dictionary) -> Variant:
	var path := str(description.get("path", ""))
	var node_part := path.get_slice(":", 0)
	var property_path := path.substr(node_part.length() + 1) if path.contains(":") else ""
	if node_part.is_empty() or property_path.is_empty():
		return "track paths are Node:property relative to the parent of the AnimationPlayer, such as \"Door:position\" or \".:visible\"; method and audio tracks take \"type\""
	var target := _root.get_node_or_null(NodePath(node_part))
	if target == null:
		return _missing_node_reason(node_part)
	var property: Variant = _property_of(target, property_path)
	if property is String:
		return property
	var interpolation: Variant = _named_value(description, "interpolation", GodotMcpAnimationVocabulary.INTERPOLATIONS, "linear")
	if interpolation is String:
		return interpolation
	var default_update := "discrete" if _is_stepped(property) else "continuous"
	var update: Variant = _named_value(description, "update", GodotMcpAnimationVocabulary.UPDATE_MODES, default_update)
	if update is String:
		return update
	var keys: Variant = _decode_value_keys(description.get("keys", []), property, target, property_path)
	if keys is String:
		return keys
	return {"type": VALUE_TRACK, "path": path, "interpolation": interpolation, "update": update, "keys": keys}


func _plan_method_track(description: Dictionary) -> Variant:
	var path := str(description.get("path", ""))
	var target: Variant = _track_node(path, METHOD_TRACK)
	if target is String:
		return target
	var key_descriptions: Variant = description.get("keys", [])
	if not key_descriptions is Array or (key_descriptions as Array).is_empty():
		return "a method track needs keys, such as [%s]" % METHOD_KEY_EXAMPLE
	var keys: Array = []
	for key_description in key_descriptions:
		var key: Variant = _method_key(key_description, target)
		if key is String:
			return key
		keys.append(key)
	return {"type": METHOD_TRACK, "path": path, "keys": _sorted_by_time(keys)}


func _method_key(key_description: Variant, target: Node) -> Variant:
	var time := _key_time(key_description)
	if time < 0.0:
		return "each key of a method track is %s" % METHOD_KEY_EXAMPLE
	var method_name := str(key_description.get("method", ""))
	if method_name.is_empty():
		return "the key at %s s names no method; each key of a method track is %s" % [_seconds(time), METHOD_KEY_EXAMPLE]
	var method_info := GodotMcpMethodArguments.info_of(target, method_name)
	if method_info.is_empty():
		var similar := GodotMcpSimilarNames.hint(method_name, GodotMcpMethodArguments.names_of(target))
		var advice := similar if not similar.is_empty() else "Write it in the script of %s first, then call editor_rescan." % target.name
		return "%s has no method %s. %s" % [target.name, method_name, advice]
	var arguments: Variant = key_description.get("args", [])
	if not arguments is Array:
		return "\"args\" of the key at %s s is a list of arguments in order, such as [\"left\"]" % _seconds(time)
	var count_problem := GodotMcpMethodArguments.count_problem(method_info, (arguments as Array).size())
	if not count_problem.is_empty():
		return "the key at %s s: %s" % [_seconds(time), count_problem]
	var decoded: Variant = GodotMcpMethodArguments.decode(_codec, target, method_info, arguments)
	if decoded is String:
		return "the key at %s s: %s" % [_seconds(time), decoded]
	return {"time": time, "value": {"method": StringName(method_name), "args": decoded}}


func _plan_audio_track(description: Dictionary) -> Variant:
	var path := str(description.get("path", ""))
	var target: Variant = _track_node(path, AUDIO_TRACK)
	if target is String:
		return target
	var audio_player := target as Node
	if not AUDIO_PLAYER_CLASSES.any(func(player_class: String) -> bool: return audio_player.is_class(player_class)):
		var kind := GodotMcpIndefiniteArticle.before(GodotMcpNodeFactory.display_class(audio_player))
		return "%s is %s; audio tracks play through an AudioStreamPlayer, AudioStreamPlayer2D or AudioStreamPlayer3D" % [audio_player.name, kind]
	var key_descriptions: Variant = description.get("keys", [])
	if not key_descriptions is Array or (key_descriptions as Array).is_empty():
		return "an audio track needs keys, such as [%s]" % AUDIO_KEY_EXAMPLE
	var stream_property: Dictionary = _property_of(audio_player, "stream")
	var keys: Array = []
	for key_description in key_descriptions:
		var key: Variant = _audio_key(key_description, audio_player, stream_property)
		if key is String:
			return key
		keys.append(key)
	return {"type": AUDIO_TRACK, "path": path, "keys": _sorted_by_time(keys)}


func _audio_key(key_description: Variant, audio_player: Node, stream_property: Dictionary) -> Variant:
	var time := _key_time(key_description)
	if time < 0.0:
		return "each key of an audio track is %s" % AUDIO_KEY_EXAMPLE
	var stream_text: Variant = key_description.get("stream")
	if stream_text == null:
		return "the key at %s s names no stream; each key of an audio track is %s" % [_seconds(time), AUDIO_KEY_EXAMPLE]
	var outcome := _codec.decode(stream_text, stream_property, audio_player)
	if not outcome.is_success:
		return "the stream of the key at %s s: %s" % [_seconds(time), outcome.error]
	if outcome.value == null:
		return "the key at %s s names no stream; each key of an audio track is %s" % [_seconds(time), AUDIO_KEY_EXAMPLE]
	var key := {"time": time, "stream": outcome.value}
	for offset_name in AUDIO_OFFSETS:
		var offset: Variant = key_description.get(offset_name, 0.0)
		if not (offset is int or offset is float) or float(offset) < 0.0:
			return "%s of the key at %s s is the seconds cut from the %s of the sound, from 0" % [offset_name, _seconds(time), AUDIO_OFFSETS[offset_name]]
		key[offset_name] = float(offset)
	return key


func _track_node(path: String, kind: String) -> Variant:
	if path.is_empty() or path.contains(":"):
		return "%s track paths name a node relative to the parent of the AnimationPlayer, such as \"Player\" or \".\" for the parent itself" % kind
	var target := _root.get_node_or_null(NodePath(path))
	if target == null:
		return _missing_node_reason(path)
	return target


func _missing_node_reason(path: String) -> String:
	return "there is no node %s under %s. %s" % [path, _root.name, GodotMcpNodeLocator.not_found_hint(_root, path)]


func _property_of(target: Node, property_path: String) -> Variant:
	var property_name := property_path.get_slice(":", 0)
	var properties := {}
	for property in target.get_property_list():
		properties[str(property["name"])] = property
	if not properties.has(property_name):
		var similar := GodotMcpSimilarNames.hint(property_name, properties.keys())
		return "%s has no property \"%s\"%s" % [target.name, property_name, "" if similar.is_empty() else ". " + similar]
	if property_path == property_name:
		return properties[property_name]
	var current: Variant = target.get_indexed(NodePath(":" + property_path))
	if current == null:
		return "%s has no part \"%s\"" % [target.name, property_path]
	return {"name": property_path, "type": typeof(current), "hint": PROPERTY_HINT_NONE, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT}


func _decode_value_keys(key_descriptions: Variant, property: Dictionary, target: Node, property_path: String) -> Variant:
	if not key_descriptions is Array or (key_descriptions as Array).is_empty():
		return "a track needs keys, such as [{\"time\": 0, \"value\": [0, 0, 0]}, {\"time\": 1, \"value\": [0, 3, 0]}]"
	var keys: Array = []
	for key_description in key_descriptions:
		var time := _key_time(key_description)
		if time < 0.0:
			return "each key is %s" % VALUE_KEY_EXAMPLE
		if not key_description.has("value"):
			return "the key at %s s has no value" % _seconds(time)
		var outcome := _codec.decode(key_description["value"], property, target)
		if not outcome.is_success:
			return "%s at %s s: %s" % [property_path, _seconds(time), outcome.error]
		keys.append({"time": time, "value": outcome.value})
	return _sorted_by_time(keys)


static func _add_value_track(animation: Animation, track: Dictionary, keys: Array) -> void:
	var index := animation.add_track(Animation.TYPE_VALUE)
	animation.track_set_path(index, NodePath(track["path"]))
	animation.track_set_interpolation_type(index, track["interpolation"])
	animation.value_track_set_update_mode(index, track["update"])
	for key in keys:
		animation.track_insert_key(index, key["time"], key["value"])


static func _add_method_track(animation: Animation, track: Dictionary) -> void:
	var index := animation.add_track(Animation.TYPE_METHOD)
	animation.track_set_path(index, NodePath(track["path"]))
	for key in track["keys"]:
		animation.track_insert_key(index, key["time"], key["value"])


static func _add_audio_track(animation: Animation, track: Dictionary) -> void:
	var index := animation.add_track(Animation.TYPE_AUDIO)
	animation.track_set_path(index, NodePath(track["path"]))
	for key in track["keys"]:
		animation.audio_track_insert_key(index, key["time"], key["stream"], key["start_offset"], key["end_offset"])


static func _repeated_track_reason(kind: String) -> String:
	if kind == VALUE_TRACK:
		return "this track is given twice; give each property one track with all its keys"
	return "this %s track is given twice; give each node one %s track with all its keys" % [kind, kind]


static func _key_time(key_description: Variant) -> float:
	if not key_description is Dictionary:
		return -1.0
	var time: Variant = key_description.get("time")
	if not (time is int or time is float) or float(time) < 0.0:
		return -1.0
	return float(time)


static func _sorted_by_time(keys: Array) -> Array:
	keys.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left["time"] < right["time"])
	return keys


static func _named_value(description: Dictionary, key: String, names: Dictionary, default_name: String) -> Variant:
	var name: Variant = description.get(key, default_name)
	var value: Variant = GodotMcpAnimationVocabulary.value_of(names, name)
	if value == null:
		return "unknown %s \"%s\"; use one of: %s" % [key, name, GodotMcpAnimationVocabulary.listed(names)]
	return value


static func _is_stepped(property: Dictionary) -> bool:
	if property["type"] in STEPPED_TYPES:
		return true
	return property["type"] == TYPE_INT and property.get("hint") == PROPERTY_HINT_ENUM


static func _last_key_time(tracks: Array) -> float:
	var last := 0.0
	for track in tracks:
		last = maxf(last, (track["keys"] as Array).back()["time"])
	return last if last > 0.0 else DEFAULT_LENGTH


static func _first_key_after(track: Dictionary, length: float) -> float:
	for key in track["keys"]:
		if key["time"] > length + 0.0001:
			return key["time"]
	return -1.0


static func _rounded(value: float) -> float:
	return roundf(value * DECIMAL_SCALE) / DECIMAL_SCALE


static func _seconds(value: Variant) -> String:
	var rounded := _rounded(float(value))
	return str(roundi(rounded)) if is_equal_approx(rounded, roundf(rounded)) else str(rounded)
