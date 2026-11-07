extends RefCounted

const GodotMcpDecodeOutcome := preload("decode_outcome.gd")


func decode(_value: Variant, _property: Dictionary, _target: Object = null) -> GodotMcpDecodeOutcome:
	return GodotMcpDecodeOutcome.new(false, null, "decode() is not implemented")
