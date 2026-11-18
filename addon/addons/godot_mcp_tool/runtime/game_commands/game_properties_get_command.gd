extends "../../commands/command.gd"

const GodotMcpGameScene := preload("game_scene.gd")
const GodotMcpGetterReader := preload("../../scene/getter_reader.gd")
const GodotMcpNodeFactory := preload("../../scene/node_factory.gd")
const GodotMcpParams := preload("../../commands/params.gd")
const GodotMcpPropertyEditor := preload("../../scene/property_editor.gd")
const GodotMcpVariantCodec := preload("../../codec/variant_codec.gd")

var _scene: GodotMcpGameScene
var _properties: GodotMcpPropertyEditor
var _getters: GodotMcpGetterReader


func _init(scene: GodotMcpGameScene, properties: GodotMcpPropertyEditor, codec: GodotMcpVariantCodec) -> void:
	_scene = scene
	_properties = properties
	_getters = GodotMcpGetterReader.new(codec)


func execute(params: Dictionary) -> Variant:
	var path: Variant = GodotMcpParams.required_text(params, "path", "\"Player\", \".\" for the current scene, or \"/root/GameState\"")
	var names: Variant = GodotMcpParams.text_list(params, "names")
	var include_defaults: Variant = GodotMcpParams.flag(params, "include_defaults", false)
	for value in [path, names, include_defaults]:
		if value is GodotMcpCommandError:
			return value
	var resolved: Variant = _scene.resolve(path)
	if resolved is GodotMcpCommandError:
		return resolved
	var node := resolved as Node
	var entries: Array = []
	if (names as Array).is_empty():
		entries = _properties.describe(node, PackedStringArray(), include_defaults)
	for requested_name in names:
		if GodotMcpGetterReader.is_call(requested_name):
			entries.append(_getters.read(node, requested_name))
		else:
			entries.append_array(_properties.describe(node, PackedStringArray([requested_name]), false))
	return {"scene": _scene.scene_path(), "path": _scene.path_of(node), "type": GodotMcpNodeFactory.display_class(node), "properties": entries}
