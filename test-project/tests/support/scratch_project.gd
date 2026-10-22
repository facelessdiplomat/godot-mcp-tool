extends RefCounted

const ScratchFolder := preload("res://tests/support/scratch_folder.gd")

var root := ""
var _assigned_uids: Array[int] = []


func _init() -> void:
	root = "res://mcp_test_scratch_%d/" % Time.get_ticks_usec()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(root.path_join("materials")))


func path(relative_path: String) -> String:
	return root.path_join(relative_path)


func write_text(relative_path: String, text: String) -> String:
	var file_path := path(relative_path)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(file_path.get_base_dir()))
	var file := FileAccess.open(file_path, FileAccess.WRITE)
	file.store_string(text)
	file.close()
	return file_path


func read_text(relative_path: String) -> String:
	return FileAccess.get_file_as_string(path(relative_path))


func build_crate_level() -> void:
	var ice := StandardMaterial3D.new()
	ice.albedo_color = Color(0.8, 0.9, 1.0)
	ResourceSaver.save(ice, path("materials/ice.tres"))
	write_text("crate.gd", "extends Node3D\n\nconst SKIN := preload(\"%s\")\n" % path("materials/ice.tres"))
	var crate := Node3D.new()
	crate.name = "Crate"
	crate.set_script(ResourceLoader.load(path("crate.gd"), "", ResourceLoader.CACHE_MODE_IGNORE))
	var mesh := MeshInstance3D.new()
	mesh.name = "Mesh"
	mesh.mesh = BoxMesh.new()
	mesh.material_override = ResourceLoader.load(path("materials/ice.tres"))
	crate.add_child(mesh)
	mesh.owner = crate
	_save_scene(crate, path("crate.tscn"))
	var level := Node3D.new()
	level.name = "Level"
	var placed := (ResourceLoader.load(path("crate.tscn")) as PackedScene).instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	level.add_child(placed)
	placed.owner = level
	_save_scene(level, path("level.tscn"))


func assign_uid(relative_path: String) -> String:
	var uid := ResourceUID.create_id()
	ResourceSaver.set_uid(path(relative_path), uid)
	ResourceUID.add_id(uid, path(relative_path))
	_assigned_uids.append(uid)
	return ResourceUID.id_to_text(uid)


func remove() -> void:
	for uid in _assigned_uids:
		if ResourceUID.has_id(uid):
			ResourceUID.remove_id(uid)
	ScratchFolder.remove(ProjectSettings.globalize_path(root))


static func _save_scene(scene_root: Node, scene_path: String) -> void:
	var scene := PackedScene.new()
	scene.pack(scene_root)
	scene_root.free()
	ResourceSaver.save(scene, scene_path)
