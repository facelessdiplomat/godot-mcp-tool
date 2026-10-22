extends RefCounted

const PREVIEW_STAND_INS := {"DirectionalLight3D": "sun", "WorldEnvironment": "sky"}


static func note_for(scene_root: Node) -> String:
	var missing_types: Array = []
	var stand_ins: Array = []
	for type_name in PREVIEW_STAND_INS:
		if not _contains(scene_root, type_name):
			missing_types.append(type_name)
			stand_ins.append(PREVIEW_STAND_INS[type_name])
	if missing_types.is_empty():
		return ""
	return "The scene has no %s of its own, so this render is lit by the editor's preview %s; the running game will look different. Check the final look with game_screenshot." % [
		" or ".join(missing_types),
		" and ".join(stand_ins),
	]


static func _contains(scene_root: Node, type_name: String) -> bool:
	return scene_root.is_class(type_name) or not scene_root.find_children("*", type_name, true, false).is_empty()
