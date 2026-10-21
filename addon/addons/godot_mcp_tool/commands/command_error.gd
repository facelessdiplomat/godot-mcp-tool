extends RefCounted

var code: int
var message: String
var hint: String


func _init(error_code: int, error_message: String, error_hint: String = "") -> void:
	code = error_code
	message = error_message
	hint = error_hint
