extends RefCounted

const AnimationVocabulary := preload("animation_vocabulary.gd")
const NodeLocator := preload("../scene/node_locator.gd")
const SimilarNames := preload("../util/similar_names.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

const STEPPED_TYPES := [TYPE_BOOL, TYPE_STRING, TYPE_STRING_NAME, TYPE_NODE_PATH, TYPE_OBJECT]
const DEFAULT_LENGTH := 1.0
const DECIMAL_SCALE := 1000.0

var _codec: VariantCodec
var _root: Node


func _init(codec: VariantCodec, root: Node) -> void:
	_codec = codec
	_root = root


func plan(track_descriptions: Array, requested_length: Variant) -> Dictionary:
	var planned: Array = []
	var rejected: Array = []
	var used_paths: Array = []
	for index in track_descriptions.size():
		var description: Variant = track_descriptions[index]
		var path := str(description.get("path", "")) if description is Dictionary else ""
		var track: Variant = _plan_track(description)
		if track is String:
			rejected.append({"index": index, "path": path, "reason": track})
			continue
		if path in used_paths:
			rejected.append({"index": index, "path": path, "reason": "this track is given twice; give each property one track with all its keys"})
			continue
		used_paths.append(path)
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
		var index := animation.add_track(Animation.TYPE_VALUE)
		animation.track_set_path(index, NodePath(track["path"]))
		animation.track_set_interpolation_type(index, track["interpolation"])
		animation.value_track_set_update_mode(index, track["update"])
		for key in track["keys"]:
			animation.track_insert_key(index, key["time"], key["value"])
	return animation


func describe(track: Dictionary) -> Dictionary:
	var keys: Array = track["keys"]
	return {
		"path": track["path"],
		"keys": keys.size(),
		"interpolation": AnimationVocabulary.name_of(AnimationVocabulary.INTERPOLATIONS, track["interpolation"]),
		"update": AnimationVocabulary.name_of(AnimationVocabulary.UPDATE_MODES, track["update"]),
		"from": _codec.encode(keys.front()["value"]),
		"to": _codec.encode(keys.back()["value"]),
	}


func _plan_track(description: Variant) -> Variant:
	if not description is Dictionary:
		return "a track is an object such as {\"path\": \"Door:position\", \"keys\": [{\"time\": 0, \"value\": [0, 0, 0]}]}"
	var path := str(description.get("path", ""))
	var node_part := path.get_slice(":", 0)
	var property_path := path.substr(node_part.length() + 1) if path.contains(":") else ""
	if node_part.is_empty() or property_path.is_empty():
		return "track paths are Node:property relative to the parent of the AnimationPlayer, such as \"Door:position\" or \".:visible\""
	var target := _root.get_node_or_null(NodePath(node_part))
	if target == null:
		return "there is no node %s under %s. %s" % [node_part, _root.name, NodeLocator.not_found_hint(_root, node_part)]
	var property: Variant = _property_of(target, property_path)
	if property is String:
		return property
	var interpolation: Variant = _named_value(description, "interpolation", AnimationVocabulary.INTERPOLATIONS, "linear")
	if interpolation is String:
		return interpolation
	var default_update := "discrete" if _is_stepped(property) else "continuous"
	var update: Variant = _named_value(description, "update", AnimationVocabulary.UPDATE_MODES, default_update)
	if update is String:
		return update
	var keys: Variant = _decode_keys(description.get("keys", []), property, target, property_path)
	if keys is String:
		return keys
	return {"path": path, "interpolation": interpolation, "update": update, "keys": keys}


func _property_of(target: Node, property_path: String) -> Variant:
	var property_name := property_path.get_slice(":", 0)
	var properties := {}
	for property in target.get_property_list():
		properties[str(property["name"])] = property
	if not properties.has(property_name):
		var similar := SimilarNames.hint(property_name, properties.keys())
		return "%s has no property \"%s\"%s" % [target.name, property_name, "" if similar.is_empty() else ". " + similar]
	if property_path == property_name:
		return properties[property_name]
	var current: Variant = target.get_indexed(NodePath(":" + property_path))
	if current == null:
		return "%s has no part \"%s\"" % [target.name, property_path]
	return {"name": property_path, "type": typeof(current), "hint": PROPERTY_HINT_NONE, "hint_string": "", "usage": PROPERTY_USAGE_DEFAULT}


func _decode_keys(key_descriptions: Variant, property: Dictionary, target: Node, property_path: String) -> Variant:
	if not key_descriptions is Array or (key_descriptions as Array).is_empty():
		return "a track needs keys, such as [{\"time\": 0, \"value\": [0, 0, 0]}, {\"time\": 1, \"value\": [0, 3, 0]}]"
	var keys: Array = []
	for key_description in key_descriptions:
		if not key_description is Dictionary or not (key_description.get("time") is int or key_description.get("time") is float) or float(key_description["time"]) < 0.0:
			return "each key is {\"time\": seconds from 0, \"value\": ...}"
		if not key_description.has("value"):
			return "the key at %s s has no value" % _seconds(key_description["time"])
		var outcome := _codec.decode(key_description["value"], property, target)
		if not outcome.is_success:
			return "%s at %s s: %s" % [property_path, _seconds(key_description["time"]), outcome.error]
		keys.append({"time": float(key_description["time"]), "value": outcome.value})
	keys.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left["time"] < right["time"])
	return keys


static func _named_value(description: Dictionary, key: String, names: Dictionary, default_name: String) -> Variant:
	var name: Variant = description.get(key, default_name)
	var value: Variant = AnimationVocabulary.value_of(names, name)
	if value == null:
		return "unknown %s \"%s\"; use one of: %s" % [key, name, AnimationVocabulary.listed(names)]
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


static func _seconds(value: Variant) -> String:
	var rounded := roundf(float(value) * DECIMAL_SCALE) / DECIMAL_SCALE
	return str(roundi(rounded)) if is_equal_approx(rounded, roundf(rounded)) else str(rounded)
