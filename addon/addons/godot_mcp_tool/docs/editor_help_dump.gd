extends SceneTree

const GDSCRIPT_PAGE := "@GDScript"
const CLASSES_META := "classes"


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.size() != 2:
		printerr("Pass the editor help cache and the output file after --.")
		quit(1)
		return
	var cache := ResourceLoader.load(arguments[0], "", ResourceLoader.CACHE_MODE_IGNORE)
	if cache == null or not cache.has_meta(CLASSES_META):
		printerr("%s is not an editor help cache." % arguments[0])
		quit(1)
		return
	var page: Variant = null
	var defaults := {}
	for class_doc in cache.get_meta(CLASSES_META):
		if class_doc.get("name") == GDSCRIPT_PAGE:
			page = class_doc
		var class_defaults := {}
		for property in class_doc.get("properties", []):
			if not str(property.get("default_value", "")).is_empty():
				class_defaults[property["name"]] = property["default_value"]
		if not class_defaults.is_empty():
			defaults[class_doc["name"]] = class_defaults
	var output := FileAccess.open(arguments[1], FileAccess.WRITE)
	output.store_string(JSON.stringify({"gdscript": page, "defaults": defaults}))
	output.close()
	quit(0)
