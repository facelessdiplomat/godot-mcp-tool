extends "../../commands/command.gd"

const GameScene := preload("game_scene.gd")
const Params := preload("../../commands/params.gd")
const PropertyEditor := preload("../../scene/property_editor.gd")

var _scene: GameScene
var _properties: PropertyEditor


func _init(scene: GameScene, properties: PropertyEditor) -> void:
	_scene = scene
	_properties = properties


func execute(params: Dictionary) -> Variant:
	var path: Variant = Params.required_text(params, "path", "\"Player\", \".\" for the current scene, or \"/root/GameState\"")
	var properties: Variant = Params.dictionary(params, "properties")
	for value in [path, properties]:
		if value is CommandError:
			return value
	if (properties as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "\"properties\" needs at least one property", "Example: {\"position\": [0, 1, 0]}")
	var resolved: Variant = _scene.resolve(path)
	if resolved is CommandError:
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
