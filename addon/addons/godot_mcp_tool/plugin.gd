@tool
extends EditorPlugin

const AddonInfo := preload("addon_info.gd")
const EditorAutoloadRegistry := preload("editor/editor_autoload_registry.gd")
const SupportedEngine := preload("editor/supported_engine.gd")

const EDITOR_SERVICES_FILE := "editor/editor_services.gd"
const AUTOLOAD_PREFIX := "autoload/"

var _services: RefCounted


func _enter_tree() -> void:
	var engine_problem := SupportedEngine.problem_with(Engine.get_version_info())
	if not engine_problem.is_empty():
		push_error(engine_problem)
		return
	var services_script := load((get_script() as Script).resource_path.get_base_dir().path_join(EDITOR_SERVICES_FILE)) as GDScript
	_services = services_script.new(self)
	_services.call(&"start")


func _process(_delta: float) -> void:
	if _services != null:
		_services.call(&"process")


func _exit_tree() -> void:
	if _services != null:
		_services.call(&"stop")
		_services = null


func _disable_plugin() -> void:
	if ProjectSettings.has_setting(AUTOLOAD_PREFIX + AddonInfo.RUNTIME_AUTOLOAD_NAME):
		EditorAutoloadRegistry.new(self).remove(AddonInfo.RUNTIME_AUTOLOAD_NAME)


func _run_scene(_scene: String, args: PackedStringArray) -> PackedStringArray:
	if _services == null:
		return args
	return _services.call(&"run_arguments", args)
