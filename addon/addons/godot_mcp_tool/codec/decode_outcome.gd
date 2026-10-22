extends RefCounted

var is_success: bool
var value: Variant
var error: String


func _init(succeeded: bool, decoded_value: Variant = null, error_message: String = "") -> void:
	is_success = succeeded
	value = decoded_value
	error = error_message
