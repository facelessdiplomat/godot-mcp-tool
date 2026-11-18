extends "../command.gd"

const GodotMcpCommand := preload("../command.gd")
const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpNodeLocator := preload("../../scene/node_locator.gd")
const GodotMcpParams := preload("../params.gd")
const GodotMcpRayProbe := preload("../../scene/ray_probe.gd")
const GodotMcpRayReport := preload("../../scene/ray_report.gd")

var _context: GodotMcpEditingContext
var _in_game: GodotMcpCommand


func _init(context: GodotMcpEditingContext, in_game: GodotMcpCommand) -> void:
	_context = context
	_in_game = in_game


func execute(params: Dictionary) -> Variant:
	var in_game: Variant = GodotMcpParams.flag(params, "in_game", false)
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var from: Variant = GodotMcpParams.point(params, "from")
	var to: Variant = GodotMcpParams.point(params, "to")
	var exclude: Variant = GodotMcpParams.text_list(params, "exclude")
	for value in [in_game, scene_path, from, to, exclude]:
		if value is GodotMcpCommandError:
			return value
	if from == null:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"from\" is required", "Example: {\"from\": [0, 10, 0]} casts a ray straight down from that point.")
	if in_game:
		return await _in_game.execute(params)
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var excluded: Array[Node] = []
	for path in exclude:
		var node := GodotMcpNodeLocator.find(scene_root, path)
		if node == null:
			return GodotMcpCommandError.new(GodotMcpJsonRpc.NOT_FOUND, "Node \"%s\" not found" % path, GodotMcpNodeLocator.not_found_hint(scene_root, path))
		excluded.append(node)
	var tree := scene_root.get_tree()
	if tree != null:
		await tree.process_frame
		await tree.physics_frame
	var end := GodotMcpRayReport.end_of(from, to)
	var hit := GodotMcpRayProbe.cast(scene_root, from, end, excluded)
	var result := GodotMcpRayReport.describe(hit, from, func(node: Node) -> String: return GodotMcpNodeLocator.path_of(scene_root, node), _context.codec)
	result["scene"] = scene_root.scene_file_path
	result["from"] = _context.codec.encode(from)
	result["to"] = _context.codec.encode(end)
	return result
