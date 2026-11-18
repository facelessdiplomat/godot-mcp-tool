extends "../command.gd"

const GodotMcpEditingContext := preload("../../scene/editing_context.gd")
const GodotMcpParams := preload("../params.gd")

const AGENT_ACTION_PREFIX := "MCP: "
const MAXIMUM_STEPS := 20
const NOTHING_LEFT := "nothing_left"
const USER_ACTION := "user_action"

var _context: GodotMcpEditingContext


func _init(context: GodotMcpEditingContext) -> void:
	_context = context


func execute(params: Dictionary) -> Variant:
	var scene_path: Variant = GodotMcpParams.text(params, "scene")
	var count: Variant = GodotMcpParams.whole_number(params, "count", 1)
	var include_user_actions: Variant = GodotMcpParams.flag(params, "include_user_actions", false)
	for value in [scene_path, count, include_user_actions]:
		if value is GodotMcpCommandError:
			return value
	if count < 1 or count > MAXIMUM_STEPS:
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"count\" is how many actions to step through, from 1 to %d" % MAXIMUM_STEPS)
	var resolved: Variant = _context.scenes.resolve_for_editing(scene_path)
	if resolved is GodotMcpCommandError:
		return resolved
	var scene_root := resolved as Node
	var stepped: Array = []
	var stopped := ""
	for step in count:
		var action_name := _next_name(scene_root)
		if action_name.is_empty():
			stopped = NOTHING_LEFT
			break
		if not include_user_actions and not action_name.begins_with(AGENT_ACTION_PREFIX):
			stopped = USER_ACTION
			break
		if not _step(scene_root):
			stopped = NOTHING_LEFT
			break
		stepped.append(action_name)
	var result := {
		"scene": scene_root.scene_file_path,
		"stopped": stopped,
		"next_undo": _context.history.next_undo_name(scene_root),
		"next_redo": _context.history.next_redo_name(scene_root),
	}
	result[_stepped_key()] = stepped
	return result


func _next_name(_scene_root: Node) -> String:
	return ""


func _step(_scene_root: Node) -> bool:
	return false


func _stepped_key() -> String:
	return ""
