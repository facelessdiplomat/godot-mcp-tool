extends "../command.gd"

const ImportOptions := preload("../../assets/import_options.gd")
const ImportSettings := preload("../../assets/import_settings.gd")
const ImportedSceneReport := preload("../../assets/imported_scene_report.gd")
const Params := preload("../params.gd")
const VariantCodec := preload("../../codec/variant_codec.gd")

const SCENE_TYPE := "PackedScene"
const PATH_EXAMPLE := "\"res://models/character.glb\""

var _codec: VariantCodec


func _init(codec: VariantCodec) -> void:
	_codec = codec


func execute(params: Dictionary) -> Variant:
	var asset_path: Variant = Params.required_text(params, "path", PATH_EXAMPLE)
	if asset_path is CommandError:
		return asset_path
	var opened: Variant = ImportSettings.open(asset_path)
	if opened is CommandError:
		return opened
	var settings := opened as ImportSettings
	return {
		"path": asset_path,
		"importer": settings.importer(),
		"type": settings.imported_type(),
		"options": describe_options(settings, _codec),
		"node_settings": describe_node_settings(settings, _codec),
		"scene": ImportedSceneReport.describe(asset_path, _codec) if settings.imported_type() == SCENE_TYPE else null,
	}


static func describe_options(settings: ImportSettings, codec: VariantCodec) -> Array:
	var described: Array = []
	for name in settings.option_names():
		described.append({"name": name, "value": ImportOptions.describe_option(name, settings.option(name), codec)})
	return described


static func describe_node_settings(settings: ImportSettings, codec: VariantCodec) -> Dictionary:
	var described := {}
	var node_settings := settings.node_settings()
	for node_path in node_settings:
		var node_options: Dictionary = node_settings[node_path]
		var described_options := {}
		for name in node_options:
			described_options[name] = ImportOptions.describe_node_option(name, node_options[name], codec)
		described[node_path] = described_options
	return described
