extends RefCounted

const NodeFactory := preload("node_factory.gd")
const PropertyEditor := preload("property_editor.gd")
const SceneAccess := preload("scene_access.gd")
const SceneResolver := preload("scene_resolver.gd")
const ScriptEditorAccess := preload("../editor/script_editor_access.gd")
const ScriptSync := preload("../editor/script_sync.gd")
const UndoHistory := preload("undo_history.gd")
const VariantCodec := preload("../codec/variant_codec.gd")

var scenes: SceneResolver
var history: UndoHistory
var codec: VariantCodec
var properties: PropertyEditor
var nodes: NodeFactory
var scripts: ScriptSync


func _init(scene_access: SceneAccess, undo_history: UndoHistory, variant_codec: VariantCodec, script_access: ScriptEditorAccess) -> void:
	scenes = SceneResolver.new(scene_access)
	history = undo_history
	codec = variant_codec
	properties = PropertyEditor.new(variant_codec)
	nodes = NodeFactory.new()
	scripts = ScriptSync.new(script_access)
