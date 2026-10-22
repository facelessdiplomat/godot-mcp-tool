extends RefCounted

const ResourcePaths := preload("../util/resource_paths.gd")

const AUTOLOAD_PREFIX := "autoload/"
const SINGLETON_MARK := "*"


static func read() -> Array:
	var autoloads: Array = []
	for autoload_name in names():
		var value := str(ProjectSettings.get_setting(AUTOLOAD_PREFIX + autoload_name))
		autoloads.append({
			"name": autoload_name,
			"path": ResourcePaths.resolve(value.trim_prefix(SINGLETON_MARK)),
			"singleton": value.begins_with(SINGLETON_MARK),
		})
	return autoloads


static func names() -> Array:
	var autoload_names: Array = []
	for property in ProjectSettings.get_property_list():
		var setting_name := str(property["name"])
		if setting_name.begins_with(AUTOLOAD_PREFIX):
			autoload_names.append(setting_name.trim_prefix(AUTOLOAD_PREFIX))
	return autoload_names


static func path_of(autoload_name: String) -> String:
	var setting_name := AUTOLOAD_PREFIX + autoload_name
	if not ProjectSettings.has_setting(setting_name):
		return ""
	return ResourcePaths.resolve(str(ProjectSettings.get_setting(setting_name)).trim_prefix(SINGLETON_MARK))
