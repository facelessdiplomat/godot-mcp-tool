extends RefCounted

const SCENE_KEY := "scene"
const WINDOWLESS_KEY := "windowless"
const WINDOW_SIZE_KEY := "window_size"


static func build(scene_path: String, windowless: bool, window_size: Vector2i) -> Dictionary:
	return {SCENE_KEY: scene_path, WINDOWLESS_KEY: windowless, WINDOW_SIZE_KEY: [window_size.x, window_size.y]}


static func scene_of(payload: Variant) -> String:
	return str((payload as Dictionary).get(SCENE_KEY, "")) if payload is Dictionary else ""


static func is_windowless(payload: Variant) -> bool:
	return payload is Dictionary and bool((payload as Dictionary).get(WINDOWLESS_KEY, false))


static func window_size_of(payload: Variant) -> Vector2i:
	var sides: Variant = (payload as Dictionary).get(WINDOW_SIZE_KEY) if payload is Dictionary else null
	if not sides is Array or (sides as Array).size() != 2:
		return Vector2i.ZERO
	return Vector2i(int(sides[0]), int(sides[1]))
