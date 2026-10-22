extends "../command.gd"

const FileSystemAccess := preload("../../editor/file_system_access.gd")
const ImportOptions := preload("../../assets/import_options.gd")
const ImportSettings := preload("../../assets/import_settings.gd")
const ImportedSceneReport := preload("../../assets/imported_scene_report.gd")
const Params := preload("../params.gd")
const SimilarNames := preload("../../util/similar_names.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

const SCENE_IMPORTER := "scene"
const SCENE_TYPE := "PackedScene"
const PATH_EXAMPLE := "\"res://models/character.glb\""
const CHANGE_EXAMPLE := "Example: {\"options\": {\"nodes/root_scale\": 0.01}, \"nodes\": {\"Body\": {\"generate/physics\": true, \"physics/shape_type\": \"Trimesh\"}}}"

var _codec: VariantCodec
var _file_system: FileSystemAccess


func _init(codec: VariantCodec, file_system: FileSystemAccess) -> void:
	_codec = codec
	_file_system = file_system


func execute(params: Dictionary) -> Variant:
	var asset_path: Variant = Params.required_text(params, "path", PATH_EXAMPLE)
	var options: Variant = Params.dictionary(params, "options")
	var nodes: Variant = Params.dictionary(params, "nodes")
	for value in [asset_path, options, nodes]:
		if value is CommandError:
			return value
	if (options as Dictionary).is_empty() and (nodes as Dictionary).is_empty():
		return CommandError.new(JsonRpc.INVALID_PARAMS, "Give the options or the node settings to change", CHANGE_EXAMPLE)
	var opened: Variant = ImportSettings.open(asset_path)
	if opened is CommandError:
		return opened
	var settings := opened as ImportSettings
	var is_scene := settings.imported_type() == SCENE_TYPE
	var scene_before: Variant = ImportedSceneReport.describe(asset_path, _codec) if is_scene else null
	var applied: Array = []
	var rejected: Array = []
	_apply_options(settings, options, applied, rejected)
	_apply_node_options(settings, nodes, scene_before, applied, rejected)
	if applied.is_empty():
		return {"path": asset_path, "applied": applied, "rejected": rejected, "scene_before": scene_before, "scene": scene_before}
	var save_error := settings.save()
	if save_error != OK:
		return CommandError.new(JsonRpc.OPERATION_FAILED, "The import settings of %s could not be saved: %s" % [asset_path, error_string(save_error)])
	_file_system.reimport(PackedStringArray([asset_path]))
	var scene_after: Variant = ImportedSceneReport.describe(asset_path, _codec) if is_scene else null
	return {"path": asset_path, "applied": applied, "rejected": rejected, "scene_before": scene_before, "scene": scene_after}


func _apply_options(settings: ImportSettings, options: Dictionary, applied: Array, rejected: Array) -> void:
	for option_key in options:
		var name := str(option_key)
		if not settings.has_option(name):
			rejected.append({"name": name, "reason": _unknown("import option", name, Array(settings.option_names()))})
			continue
		var property: Variant = ImportOptions.option_property(name, settings.option(name))
		if property == null:
			rejected.append({"name": name, "reason": "this option cannot be set through the bridge; change it in the editor's Import dock"})
			continue
		var outcome := _codec.decode(options[option_key], property)
		if not outcome.is_success:
			rejected.append({"name": name, "reason": outcome.error})
			continue
		settings.set_option(name, outcome.value)
		applied.append(name)


func _apply_node_options(settings: ImportSettings, nodes: Dictionary, scene: Variant, applied: Array, rejected: Array) -> void:
	if nodes.is_empty():
		return
	if settings.importer() != SCENE_IMPORTER:
		for node_key in nodes:
			rejected.append({"name": str(node_key), "reason": "only imported 3D scenes have node settings"})
		return
	var node_paths := _node_paths(scene)
	for node_key in nodes:
		var node_path := str(node_key)
		if not node_paths.is_empty() and not node_path in node_paths:
			rejected.append({"name": node_path, "reason": "there is no node %s in the imported scene. %s" % [node_path, SimilarNames.hint(node_path, node_paths)]})
			continue
		var node_options: Variant = nodes[node_key]
		if not node_options is Dictionary:
			rejected.append({"name": node_path, "reason": "expected an object of node settings, such as {\"generate/physics\": true}"})
			continue
		for option_key in node_options:
			var name := str(option_key)
			var label := "%s: %s" % [node_path, name]
			var property: Variant = ImportOptions.node_option_property(name)
			if property == null:
				rejected.append({"name": label, "reason": _unknown("node setting", name, ImportOptions.node_option_names())})
				continue
			var outcome := _codec.decode(node_options[option_key], property)
			if not outcome.is_success:
				rejected.append({"name": label, "reason": outcome.error})
				continue
			settings.set_node_option(node_path, name, outcome.value)
			applied.append(label)


static func _node_paths(scene: Variant) -> Array:
	if not scene is Dictionary:
		return []
	return ((scene as Dictionary)["nodes"] as Array).map(func(node: Dictionary) -> String: return node["path"])


static func _unknown(kind: String, name: String, known_names: Array) -> String:
	var similar := SimilarNames.hint(name, known_names)
	return "unknown %s%s" % [kind, "" if similar.is_empty() else ". " + similar]
