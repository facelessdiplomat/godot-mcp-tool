extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpSceneTreeDescriber := preload("../../scene/scene_tree_describer.gd")

const DEFAULT_MAX_DEPTH := 8
const DEFAULT_MAX_NODES := 300
const LISTED_CONTROL_CLASSES := ["BaseButton", "Label", "RichTextLabel", "LineEdit", "TextEdit", "Range", "ItemList", "TabBar", "Tree"]

var _scene: GodotMcpGameScene


func _init(scene: GodotMcpGameScene) -> void:
	_scene = scene


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.text(params, "path", ".")
	var max_depth: Variant = GodotMcpParams.whole_number(params, "max_depth", DEFAULT_MAX_DEPTH)
	var max_nodes: Variant = GodotMcpParams.whole_number(params, "max_nodes", DEFAULT_MAX_NODES)
	var controls: Variant = GodotMcpParams.flag(params, "controls", false)
	for value in [path, max_depth, max_nodes, controls]:
		if value is GodotMcpCommandError:
			return value
	var node: Variant = _scene.resolve(path)
	if node is GodotMcpCommandError:
		return node
	if controls:
		return _controls_under(node, maxi(max_nodes, 1))
	var describer := GodotMcpSceneTreeDescriber.new()
	var description := describer.describe(node, maxi(max_depth, 0), maxi(max_nodes, 1))
	return {"scene": _scene.scene_path(), "root": description, "node_count": describer.node_count, "truncated": describer.truncated}


func _controls_under(node: Node, max_controls: int) -> Dictionary:
	var found: Array[Control] = []
	_collect_controls(node, found)
	var listed: Array = []
	for control in found.slice(0, max_controls):
		listed.append(_describe_control(control))
	return {"scene": _scene.scene_path(), "controls": listed, "total": found.size(), "truncated": found.size() > max_controls}


static func _collect_controls(node: Node, found: Array[Control]) -> void:
	if node is Control and _is_listed(node as Control):
		found.append(node as Control)
	for child in node.get_children():
		_collect_controls(child, found)


static func _is_listed(control: Control) -> bool:
	return control.is_visible_in_tree() and LISTED_CONTROL_CLASSES.any(func(listed_class: String) -> bool: return control.is_class(listed_class))


func _describe_control(control: Control) -> Dictionary:
	var rect := control.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, control.size)
	var description := {
		"path": _scene.path_of(control),
		"type": GodotMcpNodeFactory.display_class(control),
		"rect": [roundi(rect.position.x), roundi(rect.position.y), roundi(rect.size.x), roundi(rect.size.y)],
		"focused": control.has_focus(),
	}
	var text: Variant = control.get("text")
	if text is String and not (text as String).is_empty():
		description["text"] = text
	if control is BaseButton:
		var button := control as BaseButton
		description["disabled"] = button.disabled
		if button.toggle_mode:
			description["pressed"] = button.button_pressed
	if control is Range:
		description["value"] = (control as Range).value
	return description
