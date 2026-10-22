extends RefCounted

const DecodeOutcome := preload("decode_outcome.gd")


func decode(_value: Variant, _property: Dictionary, _target: Object = null) -> DecodeOutcome:
	return DecodeOutcome.new(false, null, "decode() is not implemented")
