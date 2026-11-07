extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpPropertyEditor := preload("../../scene/property_editor.gd")

var _scene: GodotMcpGameScene
var _properties: GodotMcpPropertyEditor


func _init(scene: GodotMcpGameScene, properties: GodotMcpPropertyEditor) -> void:
	_scene = scene
	_properties = properties


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.required_text(params, "path", "\"Player\", \".\" for the current scene, or \"/root/GameState\"")
	var properties: Variant = GodotMcpParams.dictionary(params, "properties")
	for value in [path, properties]:
		if value is GodotMcpCommandError:
			return value
	if (properties as Dictionary).is_empty():
		return GodotMcpCommandError.new(GodotMcpJsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"position\": [0, 1, 0]}")
	var resolved: Variant = _scene.resolve(path)
	if resolved is GodotMcpCommandError:
		return resolved
	var node := resolved as Node
	var report := _properties.assign(node, properties)
	return {
		"scene": _scene.scene_path(),
		"path": _scene.path_of(node),
		"applied": report["applied"],
		"rejected": report["rejected"],
		"not_applied": report["not_applied"],
	}
