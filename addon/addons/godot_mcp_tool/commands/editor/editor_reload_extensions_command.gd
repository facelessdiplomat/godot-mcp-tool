extends "../command.gd"

const GodotMcpExtensionAccess := preload("../../editor/extension_access.gd")

var _extensions: GodotMcpExtensionAccess


func _init(extensions: GodotMcpExtensionAccess) -> void:
	_extensions = extensions


func execute(_params: Dictionary) -> Variant:
	_extensions.request_reload()
	return {}
