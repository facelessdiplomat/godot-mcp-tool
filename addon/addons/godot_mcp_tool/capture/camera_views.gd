extends RefCounted

const PRESETS := ["front", "back", "left", "right", "top", "iso"]
const PRESET_DIRECTIONS := {
	"front": Vector3(0, 0, 1),
	"back": Vector3(0, 0, -1),
	"left": Vector3(-1, 0, 0),
	"right": Vector3(1, 0, 0),
	"top": Vector3(0, 1, 0),
	"iso": Vector3(1, 1, 1),
}
const FRAMING_MARGIN := 1.15
const MINIMUM_RADIUS := 0.5
const NEARLY_VERTICAL := 0.99


static func preset(name: String, bounds: AABB, fov_degrees: float) -> Transform3D:
	var direction := (PRESET_DIRECTIONS[name] as Vector3).normalized()
	var center := bounds.get_center()
	var radius := maxf(bounds.size.length() / 2.0, MINIMUM_RADIUS)
	var distance := radius / sin(deg_to_rad(fov_degrees) / 2.0) * FRAMING_MARGIN
	return looking(center + direction * distance, center)


static func looking(position: Vector3, target: Vector3) -> Transform3D:
	var forward := (target - position).normalized()
	var up := Vector3.UP if absf(forward.dot(Vector3.UP)) < NEARLY_VERTICAL else Vector3.FORWARD
	return Transform3D(Basis.looking_at(forward, up), position)
