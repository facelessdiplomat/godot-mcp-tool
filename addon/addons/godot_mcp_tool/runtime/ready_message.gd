extends RefCounted

const SCENE_KEY := "scene"
const WINDOWLESS_KEY := "windowless"


static func build(scene_path: String, windowless: bool) -> Dictionary:
	return {SCENE_KEY: scene_path, WINDOWLESS_KEY: windowless}


static func scene_of(payload: Variant) -> String:
	return str((payload as Dictionary).get(SCENE_KEY, "")) if payload is Dictionary else ""


static func is_windowless(payload: Variant) -> bool:
	return payload is Dictionary and bool((payload as Dictionary).get(WINDOWLESS_KEY, false))
