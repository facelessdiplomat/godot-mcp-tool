extends RefCounted

const GlobalClasses := preload("../util/global_classes.gd")

const GDSCRIPT_KEYWORDS := [
	"and", "as", "assert", "await", "break", "breakpoint", "class", "class_name", "const", "continue", "elif", "else",
	"enum", "extends", "false", "for", "func", "if", "in", "is", "match", "namespace", "not", "null", "or", "pass",
	"preload", "return", "self", "signal", "static", "super", "trait", "true", "var", "void", "when", "while", "yield",
	"PI", "TAU", "INF", "NAN",
]
const GLOBAL_CONSTANT_FIRST_WORDS := [
	"KEY", "PROPERTY", "ERR", "TYPE", "JOY", "OP", "MIDI", "MOUSE", "INLINE", "METHOD", "EULER", "VERTICAL", "HORIZONTAL",
	"SIDE", "CORNER", "INT8", "INT16", "INT32", "INT64", "UINT8", "UINT16", "UINT32", "OK", "FAILED", "CLOCKWISE",
	"COUNTERCLOCKWISE",
]


static func problem_with(autoload_name: String) -> String:
	if not autoload_name.is_valid_unicode_identifier():
		return "\"%s\" is not a valid identifier" % autoload_name
	if ClassDB.class_exists(autoload_name):
		return "%s is the name of an engine class" % autoload_name
	if GlobalClasses.script_of(autoload_name) != null:
		return "%s is the class_name of a script" % autoload_name
	if _is_built_in_type(autoload_name):
		return "%s is the name of a built-in type" % autoload_name
	if autoload_name in GDSCRIPT_KEYWORDS:
		return "%s is a GDScript keyword" % autoload_name
	if autoload_name == autoload_name.to_upper() and autoload_name.get_slice("_", 0) in GLOBAL_CONSTANT_FIRST_WORDS:
		return "%s looks like a global constant of Godot" % autoload_name
	return ""


static func _is_built_in_type(type_name: String) -> bool:
	for type in TYPE_MAX:
		if type_string(type) == type_name:
			return true
	return false
