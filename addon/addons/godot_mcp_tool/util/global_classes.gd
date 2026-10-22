extends RefCounted


static func script_of(class_text: String) -> Script:
	for global_class in ProjectSettings.get_global_class_list():
		if global_class["class"] == class_text:
			return load(global_class["path"]) as Script
	return null


static func instantiate(script: Script) -> Object:
	var base_type := script.get_instance_base_type()
	if base_type.is_empty() or script.is_abstract() or not ClassDB.can_instantiate(base_type):
		return null
	var instance := ClassDB.instantiate(base_type)
	instance.set_script(script)
	return instance


static func names() -> Array:
	var class_names: Array = []
	for global_class in ProjectSettings.get_global_class_list():
		class_names.append(global_class["class"])
	return class_names
