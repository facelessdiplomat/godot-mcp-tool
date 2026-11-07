extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpSceneResolver := preload("../../scene/scene_resolver.gd")

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var requested_scene: Variant = GodotMcpParams.required_text(params, "path", "\"res://levels/arena.tscn\"")
	if requested_scene is GodotMcpCommandError:
		return requested_scene
	var scene_path: Variant = GodotMcpSceneResolver.with_main_scene(requested_scene)
	if scene_path is GodotMcpCommandError:
		return scene_path
	var path_error := GodotMcpSceneResolver.validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	if not ResourceLoader.exists(scene_path):
		return GodotMcpSceneResolver.missing_scene_error(scene_path)
	var open_error := _context.scenes.access.open_scene(scene_path)
	if open_error != OK:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.OPERATION_FAILED, "Could not open %s: %s" % [scene_path, error_string(open_error)])
	var root := _context.scenes.find_open_root(scene_path)
	if root == null:
		root = _context.scenes.access.edited_scene_root()
	return {"scene": scene_path, "root": {"name": str(root.name), "type": GodotMcpNodeFactory.display_class(root)}}
