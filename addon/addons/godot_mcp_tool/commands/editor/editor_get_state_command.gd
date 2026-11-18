extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(_params: Dictionary) -> Variant:
	var access := _context.scenes.access
	var scene_root := access.edited_scene_root()
	var selected: Array = []
	for node in access.current_selection():
		if scene_root != null and is_instance_valid(node) and (node == scene_root or scene_root.is_ancestor_of(node)):
			selected.append({"path": GodotMcpNodeLocator.path_of(scene_root, node), "type": GodotMcpNodeFactory.display_class(node)})
	return {
		"scene": scene_root.scene_file_path if scene_root != null else "",
		"unsaved": access.is_scene_unsaved(scene_root) if scene_root != null else false,
		"main_screen": access.main_screen_name(),
		"selected_nodes": selected,
		"selected_files": Array(access.current_file_selection()),
		"script": _context.scripts.current_script_place(),
		"open_scenes": access.open_scene_roots().map(func(root: Node) -> String: return root.scene_file_path),
	}
