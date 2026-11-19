extends "mesh_preview_access.gd"

const HEADLESS_DISPLAY := "headless"
const PREVIEW_SIZE_SETTING := "editors/grid_map/preview_size"
const DEFAULT_PREVIEW_SIZE := 64


func add_previews(library: MeshLibrary, ids: Array) -> bool:
	if DisplayServer.get_name() == HEADLESS_DISPLAY or ids.is_empty():
		return false
	var meshes: Array[Mesh] = []
	for id: int in ids:
		meshes.append(library.get_item_mesh(id))
	var settings := EditorInterface.get_editor_settings()
	var preview_size: int = settings.get_setting(PREVIEW_SIZE_SETTING) if settings.has_setting(PREVIEW_SIZE_SETTING) else DEFAULT_PREVIEW_SIZE
	var previews := EditorInterface.make_mesh_previews(meshes, preview_size)
	for index in mini(ids.size(), previews.size()):
		library.set_item_preview(ids[index], previews[index])
	return previews.size() == ids.size()
