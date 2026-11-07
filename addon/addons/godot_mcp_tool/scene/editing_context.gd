extends RefCounted

const GodotMcpNodeFactory := preload("node_factory.gd")
const GodotMcpPropertyEditor := preload("property_editor.gd")
const GodotMcpSceneAccess := preload("scene_access.gd")
const GodotMcpSceneResolver := preload("scene_resolver.gd")
const GodotMcpScriptEditorAccess := preload("../editor/script_editor_access.gd")
const GodotMcpScriptSync := preload("../editor/script_sync.gd")
const GodotMcpUndoHistory := preload("undo_history.gd")
const GodotMcpVariantCodec := preload("../codec/variant_codec.gd")

var scenes: GodotMcpSceneResolver
var history: GodotMcpUndoHistory
var codec: GodotMcpVariantCodec
var properties: GodotMcpPropertyEditor
var nodes: GodotMcpNodeFactory
var scripts: GodotMcpScriptSync


func _init(scene_access: GodotMcpSceneAccess, undo_history: GodotMcpUndoHistory, variant_codec: GodotMcpVariantCodec, script_access: GodotMcpScriptEditorAccess) -> void:
	scenes = GodotMcpSceneResolver.new(scene_access)
	history = undo_history
	codec = variant_codec
	properties = GodotMcpPropertyEditor.new(variant_codec)
	nodes = GodotMcpNodeFactory.new()
	scripts = GodotMcpScriptSync.new(script_access)
