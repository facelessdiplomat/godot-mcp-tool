extends "../command.gd"

const EditingContext := preload("../../scene/editing_context.gd")
const NodeFactory := preload("../../scene/node_factory.gd")
const Params := preload("../params.gd")
const SceneResolver := preload("../../scene/scene_resolver.gd")

var _context: EditingContext


func _init(context: EditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = Params.required_text(params, "path", "\"res://levels/arena.tscn\"")
	if scene_path is CommandError:
		return scene_path
	var path_error := SceneResolver.validate_scene_path(scene_path)
	if path_error != null:
		return path_error
	if not ResourceLoader.exists(scene_path):
		return SceneResolver.missing_scene_error(scene_path)
	var open_error := _context.scenes.access.open_scene(scene_path)
	if open_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "Could not open %s: %s" % [scene_path, error_string(open_error)])
	var root := _context.scenes.find_open_root(scene_path)
	if root == null:
		root = _context.scenes.access.edited_scene_root()
	return {"scene": scene_path, "root": {"name": str(root.name), "type": NodeFactory.display_class(root)}}
