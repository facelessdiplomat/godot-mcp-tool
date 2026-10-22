extends RefCounted

const INTERPOLATIONS := {
	"nearest": Animation.INTERPOLATION_NEAREST,
	"linear": Animation.INTERPOLATION_LINEAR,
	"cubic": Animation.INTERPOLATION_CUBIC,
	"linear_angle": Animation.INTERPOLATION_LINEAR_ANGLE,
	"cubic_angle": Animation.INTERPOLATION_CUBIC_ANGLE,
}

const UPDATE_MODES := {
	"continuous": Animation.UPDATE_CONTINUOUS,
	"discrete": Animation.UPDATE_DISCRETE,
	"capture": Animation.UPDATE_CAPTURE,
}

const LOOP_MODES := {
	"none": Animation.LOOP_NONE,
	"linear": Animation.LOOP_LINEAR,
	"pingpong": Animation.LOOP_PINGPONG,
}

const TRACK_TYPES := {
	"value": Animation.TYPE_VALUE,
	"position_3d": Animation.TYPE_POSITION_3D,
	"rotation_3d": Animation.TYPE_ROTATION_3D,
	"scale_3d": Animation.TYPE_SCALE_3D,
	"blend_shape": Animation.TYPE_BLEND_SHAPE,
	"method": Animation.TYPE_METHOD,
	"bezier": Animation.TYPE_BEZIER,
	"audio": Animation.TYPE_AUDIO,
	"animation": Animation.TYPE_ANIMATION,
}


static func name_of(names: Dictionary, value: int) -> String:
	for name in names:
		if names[name] == value:
			return name
	return str(value)


static func value_of(names: Dictionary, name: Variant) -> Variant:
	if not name is String:
		return null
	return names.get((name as String).to_lower(), null)


static func listed(names: Dictionary) -> String:
	return ", ".join(PackedStringArray(names.keys()))
